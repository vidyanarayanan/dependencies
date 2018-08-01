'use strict';
const fs = require('fs');
const path = require('path');
const request = require('request');
const util = require('./util.js');

const config = require('config');

let logger = require('bunyan');
let log = logger.createLogger({name: 'os-dep'});


const repoListApi = 'https://api.github.com/users/vidyanarayanan/repos'

/**
 * Get Package Json from repo
 * @param repo
 * @returns {Promise.<TResult>}
 */
function getPkgJson(repo) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const org = 'Norman';
    const branch = 'master';
    const url = 'https://raw.githubusercontent.com/' + org + '/' + repo + '/' + branch + '/package.json';
    return getURLContent(url)
        .then(function (content) {
            return(content);
        }).catch(function (err) {
            console.log(err);
            throw err;
        });
}

function getSpecificPkgJson(repo, location) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const org = 'vidyanarayanan';
    const branch = 'master';
    let url;
    if (!location) {
        url = 'https://raw.githubusercontent.com/' + org + '/' + repo + '/' + branch + '/package.json';
    } else {
        url = 'https://raw.githubusercontent.com/' + org + '/' + repo + '/' + branch + location + '/package.json';
    }
    return getURLContentNoFail(url)
        .then(function (content) {
            return(content);
        }).catch(function (err) {
            return('{}');
            console.log(err);
        });
}


function downloadPackageJson(repos, organization, remoteBranch) {
    const org = organization || 'Norman';
    const branch = remoteBranch || 'master';
    const filePromises = [];
    repos.forEach(function (repo) {
        const url = 'https://raw.githubusercontent.com/' + org + '/' + repo + '/' + branch + '/package.json';
        filePromises.push(new Promise(function (resolve, reject) {
            const dest = path.join('pkgfiles', repo + '.json');
            const writeStream = fs.createWriteStream(dest);
            writeStream.on('finish', function () {
                resolve(dest);
            });
            const readStream = request.get(url);
            readStream.pipe(writeStream);
        }));
    });
    return filePromises;
}


/**
 * Gets the a promise wrapping the content at a given URL
 * @param url
 * @returns {Promise}
 */
function getURLContentNoFail(url) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    return new Promise(function (resolve, reject) {
        request.get(url, function (err, res, body) {
            if (err) {
                const errContext = 'Error getting URL content from url ' + url;
                log.error(errContext);
                resolve('{\"name\" : \"dummy\"}');
            } else {
                resolve(body);
            }
        });
    });
}

/**
 * Gets the a promise wrapping the content at a given URL
 * @param url
 * @returns {Promise}
 */
function getURLContent(url) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    return new Promise(function (resolve, reject) {
        request.get(url, function (err, res, body) {
            if (err) {
                const errContext = 'Error getting URL content from url ' + url;
                log.error(errContext);
                reject(new Error(errContext + ' Error Message ' + err));
            } else {
                resolve(body);
            }
        });
    });
}

/**
 * Returns an array of repos
 * @returns {Promise.<TResult>}
 */
function getRepos() {
    let repos = [], resArray = [];
    return getURLContent(repolistURL)
        .then(function (repoListData) {
            resArray = repoListData.toString().split('\n');

            resArray.forEach((res) => {
               repos.push(res["url"]);
            });
            return (repos);
        });
}



module.exports = {
    getPkgJson: getPkgJson,
    getSpecificPkgJson : getSpecificPkgJson,
    getRepos: getRepos
}
