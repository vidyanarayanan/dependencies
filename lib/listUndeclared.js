'use strict';

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const config = require('config');
let logger = require('bunyan');
let log = logger.createLogger({name: 'os.undeclared'});

const gh = require('./gitWrapper');
const util = require('./util');
const TYPE_ENUM = util.TYPE_ENUM; //shortcut
const approvedListFile = './data/dependencies.csv';
const exemptionsFile = './data/exemptions.csv';
const synonymsFile = './data/synonyms.json';
const reportFilePart = './reports/report';

let synonyms;

/**
 * Search status
 * @type {{FOUND: number, VERSION_NOT_FOUND: number, NOT_FOUND: number}}
 */
const TYPE_SEARCH_STATUS = {
    FOUND : {key: 0, label: 'Found'},
    VERSION_NOT_FOUND : {key: 1, label: 'Version Not Found'},
    NOT_FOUND : {key: 2, label: 'Not Found'}
};

/**
 * Types of known modules list
 * APPROVED - this is the list that is already in our PPMS model
 * EXEMPT - this list accommodates for the delay between requesting the component and its showing up in the PPMS model
 * @type {{APPROVED: string, EXEMPT: string}}
 */
const TYPE_LIST = {
    APPROVED : 'Approved List',
    EXEMPT : 'Exempt List'
};

const TYPE_DEPENDENCY = {
    RUNTIME : 'Runtime',
    DEV : 'Development',
    ALL : 'Development and Runtime'
};

const SRCDIRTYPE = {
    NORMAN : 'norman'
};

/**
 * The Approved Modules list is a straightforward dump from the PPMS model. It is not likely to have comments.
 * Note - Approved doesnt necessarily mean that the component is approved legally.
 * It just means that we have it in our PPMS model for BUILD.
 * @param list
 */
function getApprovedModules(list) {
    return getModuleVersionMap(list);
}

/**
 * The Exempted Modules is a list that has all kinds of components that will eventually make their way into the model
 * However, in the interim, we dont want to see false positives for these components. Hence they are kept in the
 * exemptions list. Due to the nature of this list, we will likely have comments.
 * @param list
 * @TODO merge getApproved and getExempted into a single method. It shouldnt hurt to allow comments on the approved list
 */
function getExemptedModules(list) {
    return getModuleVersionMap(list, '###');
}

/**
 * Parses the list of components in the given model (PPMS/approved or Work In Process/exempted) into a Map.
 * The key of the Map is the npm component-name. The value is a list of declared/exempted versions.
 * @param list - the list to parse
 * @param commentStart - a set of characters representing that a line starting with these character is a comment line
 * and should be ignored during parsing. Comments must appear only in the beginning of the line.
 * @returns {Map}
 */
function getModuleVersionMap(list, commentStart) {
    let map = new Map();
    list.forEach(function (elem) {
        elem = elem.trim();
        if (!(commentStart && elem.startsWith(commentStart))) {
            let verInd = elem.lastIndexOf(' ');
            let name, version;
            if (verInd > 0) {
                name = elem.substring(0, verInd).trim();
                version = elem.substring(verInd).trim();
                //If the version string startsWith v/V, ignore the starting char.
                if (version.startsWith('v') || version.startsWith('V')) {
                    version = version.substring(1);
                }

            } else {
                name = elem;
            }
            if (name && name.length != 0) {
                let key = name.toLowerCase();
                let versions;
                if (map.has(key)) {
                    versions = map.get(key);
                    versions.add(version);
                } else {
                    versions = new Set();
                    versions.add(version);
                }
                map.set(key, versions);
            } else {
                log.warn('WARN: Ignoring ' + elem + " could not parse the version");
            }
        }
    });

    log.debug("map size :" + map.size);
    return map;
}


/**
 * Returns an array of the search result for the given repo
 * @param repo - the repo to be scanned
 * @param approved - the list of approved components (ie., modeled components)
 * @param exempted - the list of exempted components (ie., components that are soon to become part of the model)
 * @param dependencies
 */
function findUnApproved(repo, approved, exempted, dependencies, depType) {
    const resultEntries =  [];
    return new Promise(function(resolve,reject) {
        for (let module in dependencies) {
            const resultEntry = {};
            resultEntry.module = module.trim();

            if (dependencies.hasOwnProperty(module)) {
                resultEntry.dependencyType = depType;
                resultEntry.version = dependencies[module];
                resultEntry.repo = repo;
                resultEntry.moduleAlias = synonyms.get(module);
                let moduleName = resultEntry.moduleAlias || resultEntry.module;
                moduleName = moduleName.trim();

                if (!util.isInternalModule(module)) {
                    resultEntry.isBuildModule = false;
                    resultEntry.listType = TYPE_LIST.APPROVED;
                    let searchResult = findInList(moduleName, resultEntry.version, approved);
                    const approvedListSearchResult = searchResult;

                    if (searchResult.status != TYPE_SEARCH_STATUS.FOUND) {
                        searchResult = findInList(moduleName, resultEntry.version, exempted);
                        if (searchResult.status != TYPE_SEARCH_STATUS.FOUND) {
                            searchResult.status =  (approvedListSearchResult.status.key < searchResult.status.key) ? approvedListSearchResult.status : searchResult.status;
                            searchResult.knownVersions =  mergeKnownVersions(searchResult.knownVersions, approvedListSearchResult.knownVersions);
                        } else {
                            resultEntry.listType = TYPE_LIST.EXEMPT;
                            resultEntry.listType = '';
                        }
                    }

                    resultEntry.searchStatus = searchResult.status;
                    resultEntry.knownVersions = searchResult.knownVersions;

                    logResultEntry(resultEntry);

                } else {
                    resultEntry.isBuildModule = true;
                    log.debug('DEBUG: In Repo ' + repo + ' Ignoring internal module ' + module );
                }
                resultEntries.push(getCsvString(resultEntry));
            }
        }
        resolve(resultEntries);
    });

}

function logResultEntry(entry) {
    let aliasName = entry.moduleAlias ? '(' + entry.moduleAlias +') ' : ' ';

    switch (entry.searchStatus) {
        case TYPE_SEARCH_STATUS.VERSION_NOT_FOUND:
            log.error('WARN: In Repo ' + entry.repo + ' found unapproved version ' + entry.module + aliasName+ ' version:' + entry.version
                + ' under ' + entry.dependencyType  +  ' dependencies. Use one of these ' + JSON.stringify(Array.from(entry.knownVersions.values())));
            break;
        case TYPE_SEARCH_STATUS.NOT_FOUND :
            log.error('WARN: In Repo ' + entry.repo  + 'found unapproved module ' + entry.module + aliasName + ' version: ' + entry.version
                + ' under ' + entry.dependencyType  +  ' dependencies.');
            break;
        case TYPE_SEARCH_STATUS.FOUND:
            log.debug('DEBUG: In Repo ' + entry.repo  + ' Found in ' + entry.listType +  ' ' + entry.module + aliasName + ' version: ' + entry.version
                + ' under ' + entry.dependencyType  +  ' dependencies.');
            break;
    }

}

/**
 * Converts the given Search Result Entry object into a csv string
 * @param entry
 * @returns {string}
 */
function getCsvString(entry) {
    const csvLine = entry.repo + ', ' + entry.module + ', ' + (entry.moduleAlias ? entry.moduleAlias : '') + ', ' + entry.version +  ', '  + entry.dependencyType + ', '+ entry.isBuildModule + ','
        + (entry.searchStatus ? entry.searchStatus.label : ' N/A') +  ', ' + (entry.knownVersions ? Array.from(entry.knownVersions.values()).join('|') : '') + ', ' + entry.dependencyType + ' ' + (entry.searchStatus ? entry.searchStatus.label : ' N/A')
        + '\n';
    return csvLine;
}

/**
 * Returns the header for the csv entries
 * @returns {string}
 */
function getCsvHeader() {
    const csvhdr = 'Repo, Module, Module Alias, Module Version, Dependency Type, Is Build Module?, Scan Result, Allowed Versions, Full Result\n';
    return csvhdr;
}



/**
 * Utility to merge the known version list from the "approved list" search and the "exempted list" search
 * @param set1 - one of the two sets
 * @param set2 - the other set to be merged
 * @returns {Set}
 */
function mergeKnownVersions(set1, set2) {
    let merged = new Set();
    if (set1) {
        set1.forEach(function(value) {
            merged.add(value);
        });
    }
    if (set2) {
        set2.forEach(function(value) {
            merged.add(value);
        });
    }
    return merged;
}


/**
 * Scan the given list for the given module/version
 * @param moduleName
 * @param version
 * @param moduleList
 * @returns SearchResult {{status, knownVersions}}
 */
function findInList(moduleName, version, moduleList) {
    let searchResult = {};
    searchResult.status = TYPE_SEARCH_STATUS.NOT_FOUND;
    searchResult.knownVersions = moduleList.get(moduleName.toLowerCase());
    
    if (searchResult.knownVersions) {
        if(searchResult.knownVersions.has(version)) {
            searchResult.status = TYPE_SEARCH_STATUS.FOUND;
        } else {
            searchResult.status = TYPE_SEARCH_STATUS.VERSION_NOT_FOUND;
        }
    }
    return searchResult;
}


/**
 * Deprecated use findUnapproved
 * @param repo
 * @param approved
 * @param dependencies
 */
function searchApprovedList(repo, approved, dependencies) {
    for (let module in dependencies) {
        module = module.trim();

        if (dependencies.hasOwnProperty(module)) {
            const version = dependencies[module];
            if (!util.isInternalModule(module)) {
                let moduleAlias = synonyms.get(module);
                const aliasName = moduleAlias ? '(' + moduleAlias +')' : ' ';
                let moduleName = moduleAlias || module;
                moduleName = moduleName.trim();

                let versions = approved.get(moduleName.toLowerCase());
                if (versions) {
                    let found = false;
                    found = versions.has(version);
                    if (!found) {
                        log.error('WARN: In Repo ' + repo + ' Found unapproved version ' + module  +  ' ' + aliasName + ' ' + version
                            + '. Use one of these ' + JSON.stringify(Array.from(versions.values())));
                    }
                } else {
                    log.error('WARN: In Repo ' + repo + ' Could not find approval for: ' + module + ' ' + aliasName + ' version ' + version );
                }
            } else {
                log.debug('DEBUG: In Repo ' + repo + ' Ignoring internal module ' + module );
            }
        }
    }
}

/**
 * deprecated
 * @param dependencies
 * @returns {Set}
 * @TODO remove this method
 */
function getDependencyModules(dependencies) {
    let keys = Object.keys(dependencies);
    let modules = new Set();

    keys.forEach(function(key) {
        let module = {};
        // let version = dependencies[keys[i]].version;
        module.name = key;
        module.version = dependencies[key].version;
        modules.add(module);
    });
    return modules;
}





/**
 * The main workhorse
 * @returns {Promise.<TResult>}
 */
function doRunAll() {

    // Step 1: Get the approved list as an array
    return util.parseFile(approvedListFile, TYPE_ENUM.ARRAY)
        .then(function(array){
            // Step 2: Parse the approved list array into module names, versions
            let approved = getApprovedModules(array);
            log.debug('Approved module count ' + approved.size);
            // Step 3: Get into an array, any modules are to be exempted or treated as declared (example work in progress submissions)
            return util.parseFile(exemptionsFile, TYPE_ENUM.ARRAY)
                .then(function(exemptList){
                    // Step 4: Parse into an object, the exemptions list
                    let exempted = getExemptedModules(exemptList);

                    // Step 5: Parse into an object, the mapping of the names modules vs the modules names as declared in the os tool
                    return util.parseFile(synonymsFile, TYPE_ENUM.JSON)
                        .then(function(content) {
                            synonyms = util.parseSynonyms(content.synonyms);

                            //Step 6: Retrieve the repo list
                            return gh.getRepos()
                                .then(function(repos) {
                                    //Step 7: Create a header for the report
                                    return util.writeStringToFile(getCsvHeader(), reportFile)
                                        .then(function() {

                                            //Step 8: Retrieve the pkg json for each of the repos
                                            repos.forEach(function(repo) {
                                                let ghresp; //so pkgjson below is accessible outside the then block
                                                return gh.getPkgJson(repo)
                                                    .then(function(pkgJson) {
                                                        ghresp = pkgJson;
                                                        const json = JSON.parse(pkgJson);

                                                        //Step 9: Scan the pkg json for undeclared components, create the report
                                                        return scanPackageJson(repo, approved, exempted, json, TYPE_DEPENDENCY.ALL)
                                                            .then(function(entries) {
                                                                return util.appendArrayToFile(entries, reportFile);
                                                            });
                                                    })
                                                    .catch(function(err) {
                                                        if (ghresp.includes('404')) {
                                                            log.debug('Package Json Not Found for ' + repo)
                                                        } else {
                                                            log.warn('Error retrieving/parsing package json for repo ' + repo + ' ' + ghresp);
                                                            log.warn(err);
                                                        }
                                                    });
                                            });
                                        });
                                });
                        });
                });
        })
        .catch(function (error) {
            log.error(error);
        });
}

function scanPackageJson(repo, approved, exempted, json, dependencyType) {
    return new Promise(function(resolve, reject) {
        dependencyType = dependencyType || TYPE_DEPENDENCY.RUNTIME;
        switch (dependencyType) {
            case TYPE_DEPENDENCY.RUNTIME:
                findUnApproved(repo, approved, exempted, json.dependencies, dependencyType)
                    .then(function(rtResult) {
                        resolve(rtResult);
                    });
                break;
            case TYPE_DEPENDENCY.DEV:
                return findUnApproved(repo, approved, exempted, json.devDependencies, dependencyType)
                    .then(function(devResult) {
                        resolve(devResult);
                    });
                break;
            case TYPE_DEPENDENCY.ALL:
                //TODO parallelize
                // const rtPromise = findUnApproved(repo, approved, exempted, json.dependencies, dependencyType);
                // const devPromise = findUnApproved(repo, approved, exempted, json.devDependencies, dependencyType);
                return findUnApproved(repo, approved, exempted, json.dependencies, TYPE_DEPENDENCY.RUNTIME)
                    .then(function (rtResults) {
                        return findUnApproved(repo, approved, exempted, json.devDependencies, TYPE_DEPENDENCY.DEV)
                            .then(function (devResults) {
                                resolve(rtResults.concat(devResults));
                            });
                    });
        }

    });
}


function parseCommandLine() {
    let k, n, repo, dependencies;

    let clargs = {
        SRCDIR : {key: 0, label: '--srcdir', value: 'norman'},
        REPORTFILE : {key: 1, label: '--report'}
    };

    n = process.argv.length; // eslint-disable-line
    if (n < 1) {
        throwBadCommandLine('Usage: node listUndeclared.js --srcdir fullpathoflocaldir/* --report reportfile');
    }

    for (k = 2, n = process.argv.length; k < n; ++k) { // eslint-disable-line
        if (process.argv[k] === clargs.SRCDIR.label) { // eslint-disable-line
            clargs.SRCDIR.value = process.argv[++k];  // eslint-disable-line
        } else if (process.argv[k] === clargs.REPORTFILE.label) { // eslint-disable-line
            clargs.REPORTFILE.value = process.argv[++k];  // eslint-disable-line
        }
    }

    if (_.isEmpty(clargs.SRCDIR.value)) { // || _.isEmpty(clargs.MODELFILE.value)) {
        throwBadCommandLine('Usage: node listUndeclared.js --srcdir fullpathoflocaldir/* --report reportfile');
    }
    return clargs;
}

function doRun() {
    const clargs = parseCommandLine();

    // Step 1: Get the approved list as an array
    return util.parseFile(approvedListFile, TYPE_ENUM.ARRAY)
        .then(function (array) {
            // Step 2: Parse the approved list array into module names, versions
            log.debug('Getting the dependencies from the ppms model');
            let approved = getApprovedModules(array);
            log.debug('ppms module count ' + approved.size);
            // Step 3: Get into an array, any modules are to be exempted or treated as declared (example work in progress submissions)
            log.debug('Getting the in-progress dependency submissions from the exemptions list');
            return util.parseFile(exemptionsFile, TYPE_ENUM.ARRAY)
                .then(function (exemptList) {
                    // Step 4: Parse into an object, the exemptions list
                    let exempted = getExemptedModules(exemptList);

                    // Step 5: Parse into an object, the mapping of the names modules vs the modules names as declared in the os tool
                    log.debug('Getting the synonyms from the synonyms list');
                    return util.parseFile(synonymsFile, TYPE_ENUM.JSON)
                        .then(function (content) {
                            synonyms = util.parseSynonyms(content.synonyms);
                            const reportFile = clargs.REPORTFILE.value || getReportFileName();
                            return util.writeStringToFile(getCsvHeader(), reportFile)
                                .then(function () {

                                    if (clargs.SRCDIR.value.toLowerCase() === SRCDIRTYPE.NORMAN) {
                                        log.debug('scanning all of Norman');
                                        scanNormanRepos(approved, exempted, TYPE_DEPENDENCY.ALL, reportFile)
                                            .then(function () {
                                                log.info('completed full org scan');
                                            });
                                    } else {
                                        const reponame = clargs.SRCDIR.value;
                                        log.debug('scanning ' + reponame);
                                        let files = getLocalPkgJsonFiles(reponame);
                                        files.forEach(function (file) {
                                            return util.parseFile(file, TYPE_ENUM.JSON)
                                                .then(function (json) {
                                                    //Step 9: Scan the pkg json for undeclared components, create the report
                                                    return scanPackageJson(reponame, approved, exempted, json, TYPE_DEPENDENCY.ALL)
                                                        .then(function (entries) {
                                                            return util.appendArrayToFile(entries, reportFile);
                                                        });
                                                });
                                        });
                                    }
                                });

                        });
                });
        });
}

function scanNormanRepos(approved, exempted, dependencyType, reportFile) {
    return gh.getRepos()
        .then(function(repos) {
            repos.forEach(function (repo) {
                let ghresp; //so pkgjson below is accessible outside the then block
                return gh.getPkgJson(repo)
                    .then(function (pkgJson) {
                        ghresp = pkgJson;
                        const json = JSON.parse(pkgJson);

                        //Scan the pkg json for undeclared components, create the report
                        return scanPackageJson(repo, approved, exempted, json, TYPE_DEPENDENCY.ALL)
                            .then(function (entries) {
                                return util.appendArrayToFile(entries, reportFile);
                            });
                    })
                    .catch(function (err) {
                        if (ghresp.includes('404')) {
                            log.debug('Package Json Not Found for ' + repo)
                        } else {
                            log.warn('Error retrieving/parsing package json for repo ' + repo + ' ' + ghresp);
                            log.warn(err);
                        }
                    });
            });
        });
}

function getLocalPkgJsonFiles(location) {
    let files = [];
    files.push(path.join(location, 'package.json'));
    return files;
}

function getReportFileName() {
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const day = today.getUTCDate();
    const year = today.getUTCFullYear();
    return (reportFilePart + year + month + day + '.csv');
}

doRun();

