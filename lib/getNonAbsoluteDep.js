'use strict';

let _ = require('lodash');
let fs = require('fs');
let config = require('config');
let logger = require('bunyan');
let log = logger.createLogger({name: 'os-nonabs'});
let util = require('./util');

const FLEXIBLE_SIG = ['~', '^', '>', '<'];

//Get the inputs from commandline
function parseCommandLine(cl) {
    let packageFile;
    if (process.argv.length < 2) {  // eslint-disable-line
        throwBadCommandLine('Usage: node getNonAbsolute.js \"package.json\"');
    }
    console.log(process.argv[0], process.argv[1]);
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
            FLEXIBLE_SIG.forEach(function(c) {
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
        .then(function (dependency) {
            log.debug("Given dependencies " + JSON.stringify(dependency.dependencies));
            let dependencies = util.getDependencyModules(dependency.dependencies);
            findNonAbsolute(dependencies);
        }).catch(function (error) {
            log.error(error);
        });

}


doRun();