'use strict';

let _ = require('lodash');
let Stream = require('stream');

let fs = require('fs');
let config = require('config');
let logger = require('bunyan');
let log = logger.createLogger({name: 'os.report'});


let util = require('./util');




const FLEXIBLE_SIG = ['~', '^', '>', '<'];

//Get the inputs from commandline
function parseCommandLine(cl) {
    let packageFile;
    if (process.argv.length < 2) {  // eslint-disable-line
        throwBadCommandLine('Usage: node getNonAbsolute.js \"package.json\"');
    }
    packageFile = process.argv[2];
    return packageFile;
}

function throwBadCommandLine(message) {
    let error = new Error(message);
    error.code = 'BAD_COMMAND_LINE';
    throw error;
}

function findNonAbsolute(dependencies) {

    for (let module of dependencies) {
        if (!util.isInternalModule(module.name)) {
            let ver = module.version;
            FLEXIBLE_SIG.forEach(function (c) {
                if (ver.startsWith(c)) {
                    log.warn(module.name + " : " + module.version + " is not absolute");
                }
            });
        }
    }
}


function doRun() {

    //Find the files to parse
    let pkgjsonfile = parseCommandLine();

    //Get dependencies
    return util.parseFile(pkgjsonfile, util.TYPE_ENUM.JSON)
        .then(function (dependencyList) {
            let dependencies = getModulesAndVersions(dependencyList);
        }).catch(function (error) {
            log.error(error);
        });

}

function isNonAbsoluteVersion(version) {
    return FLEXIBLE_SIG.includes(version.charAt(0));
}

function getModulesAndVersions(dependencies) {
    let keys = Object.keys(dependencies);
    let modules = new Set();
    let versions = new Set();

    keys.forEach(function (key) {
        let nonabs = dependencies[key].versions.filter(function (val) {
            return (isNonAbsoluteVersion(val.version));
        });

        nonabs.forEach(function (usage) {
            let pkgs = usage.packages.filter(function (pkg) {
                let usageTokens = pkg.split('@');
                if ("peerDependency" == usageTokens[1]) {
                    return false;
                } else {
                    return true;
                }

            });
            if (pkgs.length > 0) {
                log.warn(key + ": " + usage.version + " packages  " + JSON.stringify(pkgs));
            }
        });

    });
    return modules;
}


doRun();