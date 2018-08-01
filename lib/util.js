'use strict';

let fs = require('fs');
let config = require('config');

let logger = require('bunyan');
let log = logger.createLogger({name: 'os.util'});

const TYPE_ENUM = {
    ARRAY : 'ARRAY',
    JSON : 'JSON'
};

const INTERNAL_SIGNATURE = ['build', 'norman', 'eslint-config-build', 'node-build'];

/**
 * Parses a file
 * @param fileName
 * @param type
 * @returns {Promise}
 */
function parseFile(fileName, type) {
    let obj;
    return new Promise(
        function (resolve, reject) {
            try {
                let data = fs.readFileSync(fileName, {encoding: 'utf-8'});
                if (type == TYPE_ENUM.ARRAY) {
                    obj = data.toString().split('\n');
                } else if (type == TYPE_ENUM.JSON) {
                    obj = JSON.parse(data);
                } else {
                    obj = data.toString();
                }
                resolve(obj);
            }
            catch (err) {
                reject(err);
            }
        });
}

/**
 * Parses the file and returns the object
 * @param fileName
 * @param type
 * @returns {*}
 */
function parse(fileName, type) {
    let input = fs.createReadStream(fileName);
    let obj;
    input.on('data', function(data) {
        if (type == TYPE_ENUM.ARRAY) {
            obj = data.toString().split('\n');
        } else if (type == TYPE_ENUM.JSON) {
            obj = JSON.parse(data);
        } else {
            obj = data.toString();
        }
    });
    return obj;
}

function isInternalModule(name) {
    let internal = false;
    let mn = name.trim().toLowerCase();
    INTERNAL_SIGNATURE.forEach(function(sig) {
        if (!internal) {
            if (mn.startsWith(sig)) {
                internal = true;
            }
        }
    });
    return internal;
}

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

function appendArrayToFile(list, filename) {
    return new Promise(function(resolve,reject) {
        if (Array.isArray(list)) {
            try {
                fs.appendFileSync(filename, list.join(''));
                resolve();
            } catch (err) {
                reject(err);
            }
        }
        resolve();
    });
}



function writeStringToFile(data, filename, append) {
    return new Promise(function(resolve,reject) {
        try {
            if (append) {
                fs.appendFileSync(filename, data);
            } else { 
                fs.writeFileSync(filename, data);
            }
            resolve();
        } catch (err) {
            reject(err);
        }

        resolve();
    });
}



/**
 * Creates an in-memory map that relates an npm module name to its actual name in the PPMS model, if the names are different.
 * If a component synonym does not exist, it means that component is modeled in PPMS with its actual npm name.
 * @param synonymObj - map of npm actual name to the name in the ppms model if it is different from the actual name.
 */
function parseSynonyms(synonymObj) {
    let synonyms = new Map();
    synonymObj.forEach(function(item) {
        for (let key in item) {
            if (item.hasOwnProperty(key)) {
                synonyms.set(key, item[key]);
            }
        }
    });

    log.debug('Parsed ' + synonyms.size + ' synonyms: ' +  synonyms.values());
    return synonyms;
}

module.exports = {
    TYPE_ENUM : TYPE_ENUM,
    appendArrayToFile : appendArrayToFile,
    getDependencyModules : getDependencyModules,
    isInternalModule : isInternalModule,
    parse: parse,
    parseFile : parseFile,
    parseSynonyms : parseSynonyms,
    writeStringToFile : writeStringToFile
}