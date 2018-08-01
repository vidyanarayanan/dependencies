'use strict';

const config = require('config');
let logger = require('bunyan');
let log = logger.createLogger({name: 'report-usages'});

const gh = require('./gitWrapper');
const util = require('./util');
const reportFile = './reports/usage-report.csv';
const moduleListFile = './data/modules.csv';

function doRun() {
    let resultmap = new Map();
    let resultStr = [];
    let repos;
    return util.writeStringToFile(getCsvHeader(), reportFile)
        .then(function () {
            return gh.getRepos()
                .then(function (repositories) {
                    repos = repositories;
                    return util.parseFile(moduleListFile, util.TYPE_ENUM.ARRAY)
                        .then(function (modules) {
                            console.log(modules);
                            modules.forEach(function (module) {
                                repos.forEach(function (repo) {
                                    // console.log(repo);
                                    let ghresp;
                                    return gh.getPkgJson(repo)
                                        .then(function (pkgJson) {
                                            let repoVersions = {};
                                            ghresp = pkgJson;
                                            const json = JSON.parse(pkgJson);
                                            const resultmap = new Map();
                                            const dependencies = json.dependencies;
                                            const devDependencies = json.devDependencies;
                                            if ((dependencies && dependencies.hasOwnProperty(module)) || (devDependencies && devDependencies.hasOwnProperty(module))) {
                                                let repoResultStr = module + ", " + repo + ", ";
                                                repoVersions.repo = repo;
                                                if (dependencies && dependencies.hasOwnProperty(module)) {
                                                    repoVersions.dep = dependencies[module];
                                                    // console.log(repoVersions.dep);
                                                    repoResultStr += repoVersions.dep;
                                                }

                                                repoResultStr += ", ";

                                                if (devDependencies && devDependencies.hasOwnProperty(module)) {
                                                    repoVersions.devDep = devDependencies[module];
                                                    // console.log(repoVersions.devDep);
                                                    repoResultStr += repoVersions.devDep;
                                                }
                                                repoResultStr += "\n";
                                                let reposAndVersionsArray = resultmap.get(module);
                                                if (!reposAndVersionsArray) {
                                                    reposAndVersionsArray = [];
                                                }
                                                reposAndVersionsArray.push(repoVersions);
                                                resultmap.set(module, reposAndVersionsArray);
                                                resultStr.push(repoResultStr);
                                                console.log('results ' + resultStr.length);
                                                return util.writeStringToFile(repoResultStr, reportFile, true);
                                            }
                                        })
                                        .catch(function (err) {
                                            if (ghresp && ghresp.includes('404')) {
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
}


function getCsvHeader() {
    return "Module, Repo, Runtime, Dev\n";
}

// function getModuleUsage(module, json, repo) {
//     const resultmap = new Map();
//     const dependencies = json.dependencies;
//     const devDependencies = json.devDependencies;
//
//     return new Promise(function(resolve, reject) {
//         let versionsObj = {};
//
//         if (dependencies.hasOwnProperty(module)) {
//             versionsObj.dep = dependencies[module];
//         }
//         if (devDependencies.hasOwnProperty(module)) {
//             versionsObj.devDep = dependencies[module];
//         }
//
//         resultmap.set(module, versionsObj);
//
//     });
// }

function getModules(module, isFile) {
    return new Promise(function(resolve, reject) {
        if (isFile) {
            util.parseFile(module, TYPE_ENUM.ARRAY)
                .then (function(modules) {
                    resolve(modules);
                });
        } else {
            const moduleList = [];
            moduleList.push(module);
            resolve(moduleList);
        }
    });

}

doRun();