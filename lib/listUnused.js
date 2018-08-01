const util = require('./util');
const gh = require('./gitWrapper');
const synonymsFile = './data/synonyms.json';
const declarationsFile = './data/dependencies.csv'; //From PPMS
const preReqsFile = './data/prereqs.csv';
const reportFile = './reports/unused.csv';
const depfile = './reports/alldependencies.txt';
const config = require('config');
let logger = require('bunyan');
let log = logger.createLogger({name: 'os.unused'});

/**
 *
 * @returns {Promise}
 *
 * consolidate.dependencies => Map {modulename : [version1, 2]}
 *
 */
function getConsolidatedDependencies(synonyms) {
    return gh.getRepos()
        .then(repos => {
            console.log("number of repos " +  repos.length + "[" + repos + "]");
            let pjPromises = [];
            repos.forEach(repo => {
                pjPromises.push(gh.getSpecificPkgJson(repo));
                pjPromises.push(gh.getSpecificPkgJson(repo, '/test/int'));
                pjPromises.push(gh.getSpecificPkgJson(repo, '/test/e2e'));
            });

            let consolidated = {};
            consolidated.dependencies = new Map();
            let vers = new Set();
            let allpkgs = '';
            let modulecount = 0;
            return Promise.all(pjPromises)
                .then((pkgJsons) => {

                    console.log(pkgJsons.length + " **** pkgjs found");

                    //avoiding failures from null pkgjson
                    for (let i = 0;  i < pkgJsons.length; i++) {
                        let pkgJson = pkgJsons[i];
                        console.log("i" + i);
                        // pkgJsons.forEach(pkgJson => {
                        if (pkgJson && pkgJson != undefined) {

                            let pkg = getPkg(pkgJson);
                            console.log('Looking into repo: =>');
                            if (pkg) {
                                allpkgs += pkgJson;
                                console.log(" repo: " + pkg.name);

                                let modules, devModules;
                                if (pkg.dependencies) {
                                    modules = Object.keys(pkg.dependencies);

                                    modules.forEach(module => {
                                        modulecount++;
                                        let ver = pkg.dependencies[module];
                                        let versions = new Set();
                                        if (synonyms && synonyms.has(module)) {
                                            // console.log("^^ found in synonyms " + module);
                                            module = synonyms.get(module); //replace module with its synonym
                                        }
                                        if (consolidated.dependencies.has(module)) {
                                            versions = consolidated.dependencies.get(module);
                                            versions.add(ver);
                                        } else {
                                            versions.add(ver);
                                        }
                                        consolidated.dependencies.set(module, versions);
                                        modulecount++;
                                    });
                                }

                                if (pkg.devDependencies) {

                                    devModules = Object.keys(pkg.devDependencies);

                                    devModules.forEach(module => {
                                        let ver = pkg.devDependencies[module];
                                        let versions = new Set();
                                        if (synonyms && synonyms.has(module)) {
                                            // console.log("^^ found in synonyms " + module);
                                            module = synonyms.get(module); //replace module with its synonym
                                        }
                                        if (consolidated.dependencies.has(module)) {
                                            versions = consolidated.dependencies.get(module);
                                            versions.add(ver);
                                        } else {
                                            versions.add(ver);
                                        }
                                        consolidated.dependencies.set(module, versions);
                                        modulecount++;
                                    });
                                }

                            }
                            else {
                                console.log('no package json, skipping');
                            }
                        }
                    }
                    console.log("metrics: pkgjsons length, consolidated dep size");
                    console.log(pkgJsons.length);
                    console.log(consolidated.dependencies.size +  ' module count ' + modulecount);
                    return Promise.resolve(consolidated);
                })
                .catch(err => {
                    console.log(err);
                    return Promise.resolve(consolidated);
                });
        });
}



function getPkg(jsonString) {
    let pkg = {};
    try {
        pkg = JSON.parse(jsonString);
    } catch (err)  {
        console.log('ignoring error with json: ' + jsonString);
    }
    return pkg;

}


function readSynonyms() {
    return new Promise((resolve, reject) =>
    {
        return util.parseFile(synonymsFile, util.TYPE_ENUM.JSON)
            .then(function (content) {
                let synonyms = util.parseSynonyms(content.synonyms);
                return resolve(synonyms);
            })
            .catch(err => {
                console.log(err);
                return reject(err);
            });
    });

}


function readDeclaredModules() {
    return new Promise((resolve, reject) =>
    {
        return util.parseFile(declarationsFile, util.TYPE_ENUM.ARRAY)
            .then(function (content) {
                return resolve(content);
            })
            .catch(err => {
                console.log(err);
                return reject(err);
            });
    });

}

function readPreReqsSet() {
    let prereqs = new Set();
    return new Promise((resolve, reject) =>
    {
        return util.parseFile(preReqsFile, util.TYPE_ENUM.ARRAY)
            .then(function (content) {
                content.forEach((prereq) => {
                    // console.log('## ' + prereq);
                    prereqs.add(prereq);
                });
                return resolve(prereqs);
            })
            .catch(err => {
                console.log(err);
                return reject(err);
            });
    });

}

return readSynonyms()
    .then((synonymlist) => {
        let synonyms = synonymlist;
        readPreReqsSet()
            .then((preReqs) => {
                getConsolidatedDependencies(synonyms)
                    .then(consolidated => {
                        if (consolidated) {
                            console.log("Dependencies");
                            console.log("************");
                            console.log(consolidated.dependencies);
                            console.log("exexex*****************");

                            return readDeclaredModules()
                                .then(moduleversions => {
                                    const usageReport = [];

                                    // console.log(" declared:" + moduleversions);
                                    return util.writeStringToFile('Module, Version, Used?\n', reportFile)
                                        .then(() => {

                                            moduleversions.forEach(module => {
                                                module = module.substring(0, module.length - 1);
                                                console.log("*** " + module);
                                                const lastsp = module.lastIndexOf(' ');
                                                const modname = module.substring(0, lastsp);
                                                const modver = module.substring(lastsp + 1);
                                                console.log("trying to find usage of [" + modname + "] version [" + modver + "]");
                                                let repoModule = consolidated.dependencies.get(modname);

                                                let reportline;

                                                console.log("## " + repoModule);
                                                if (preReqs.has(modname)) {
                                                    reportline = modname + ',' + modver + ',' + 'PreReq\n';
                                                    console.log("**** " + module + " is a prereq");
                                                } else if (!repoModule) {
                                                    reportline = modname + ',' + modver + ',' + 'Not Found\n';
                                                    console.log("**** " + module + " not used in Runtime or devtime");
                                                } else if (repoModule.has(modver)) {
                                                    reportline = modname + ',' + modver + ',' + 'Found\n';
                                                } else {
                                                    reportline = modname + ',' + modver + ',' + 'Version Not Found\n';
                                                    console.log("**** " + module + " NOT used");
                                                }
                                                usageReport.push(reportline);
                                            });
                                            util.appendArrayToFile(usageReport, reportFile);
                                        });
                                });


                            // pjs.forEach(pkgjson => {
                            //     console.log(pkgjson.dependencies);
                            //     console.log(pkgjson.devDependencies);
                            // });
                        } else {
                            console.log('no dependencies found');
                        }
                    });
            });
    });
