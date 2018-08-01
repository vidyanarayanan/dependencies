'use strict';

let config = {
    logging: {
        logDirectory: './logs',
        output : {
            console: {
                type: 'console'
            },
            logfile: {
                type: 'file',
                path: 'os-dep-{now:yyyyMMdd}-{pid}.log'
            }
        },
        loggers: {
            '*': {
                console: 'debug',
                logfile: 'warn'
            }
        }
    }
};


module.exports = config;