const PluginError = require('plugin-error')
const Transform = require('stream').Transform;
const UglifyJS = require("uglify-es");
const uglifycss = require('uglifycss');
const imagemin = require('imagemin');
const minify = require('html-minifier').minify;
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminSvgo = require('imagemin-svgo');
const fit = require('fit-template');
const log = require('fancy-log');

const PLUGIN_NAME = 'gulp-multimin';

const includes = {
    javascript: ['.js'],
    html: ['.html', '.htm'],
    css: ['.css'],
    image: ['.jpeg', '.jpg', '.png', '.gif', '.svg'],
    fit: ['.fit']
};

const excludes = {
    javascript: ['.min.js'],
    css: ['.min.css']
};

const converters = {
    javascript: function(input, options) {
        let option = options || {};
        let data = input.contents.toString('utf8');
        return new Promise((resolve, reject) => {
            try {
                let result = UglifyJS.minify(data, option);
                if(!!result.error) {
                    reject(result.error);
                } else {
                    input.contents = Buffer.from(result.code, 'utf8')
                    resolve(input);
                }
            } catch(e) {
                reject(e.message);
            }
        });
    },
    html: function(input, options) {
        let option = {};
        Object.keys(options).forEach(k => {
            option[k] = options[k];
        });
        let data = input.contents.toString();
        return new Promise((resolve, reject) => {
            try {
                input.contents = Buffer.from(minify(data, option), 'utf8');
                resolve(input);
            } catch(e) {
                reject(e.message);
            }
        });
    },
    css: function(input, options) {
        let option = {};
        Object.keys(options).forEach(k => {
            option[k] = options[k];
        });
        let data = input.contents.toString('utf8');
        return new Promise((resolve, reject) => {
            try {
                input.contents = Buffer.from(uglifycss.processString(data, option), 'utf8');
                resolve(input);
            } catch(e) {
                reject(e.message);
            }
        });
    },
    image: function(input, options) {
        let option = {
            plugins: [
                imageminJpegtran(),
                imageminPngquant(),
                imageminGifsicle(),
                imageminSvgo({
                    plugins: [
                        {removeViewBox: false}
                    ]
                })
            ]
        };
        Object.keys(options).forEach(k => {
            option[k] = options[k];
        });
        return new Promise((resolve, reject) => {
            try {
                imagemin.buffer(input.contents, option)
                .then(data => {
                    input.contents = data;
                    resolve(input);
                }, reason => {
                    reject(reason);
                });
            } catch(e) {
                reject(e.message);
            }
        })
    },
    fit: function(input, options) {
        return new Promise((resolve, reject) => {
            try {
                if(options.toString().indexOf('[object Map]') === 0) {
                    for(let k of options.keys()) {
                        if(input.path.match(k) || input.path.indexOf(k) > -1) {
                            input.contents = Buffer.from(fit(input.contents.toString('utf8'))(options.get(k)), 'utf8');
                            input.path = input.path.substr(0, input.path.length - 4);
                        }
                    }
                } else {
                    Object.keys(options).forEach(k => {
                        if(input.path.indexOf(k) > -1) {
                            input.contents = Buffer.from(fit(input.contents.toString('utf8'))(options[k]), 'utf8');
                            input.path = input.path.substr(0, input.path.length - 4);
                        }
                    });
                }
                //resolve(input);
                if(input.path.indexOf('.js') === input.path.length - 3) {
                    converters.javascript(input)
                    .then(result => {
                        resolve(result);
                    }, reason => {
                        reject(reason);
                    });
                }
                if(input.path.indexOf('.css') === input.path.length - 4) {
                    converters.css(input)
                    .then(result => {
                        rresolve(result);
                    }, reason => {
                        reject(reason);
                    });
                }
                if(input.path.indexOf('.html') === input.path.length - 5 || input.path.indexOf('.htm') === input.path.length - 4) {
                    converters.html(input, {
                        collapseWhitespace: true,
                        minifyCSS: true,
                        minifyJS: true,
                        removeComments: true,
                    }).then (result => {
                        resolve(result);
                    }, reason => {
                        reject(reason);
                    });
                }
            } catch(e) {
                reject(e.message);
            }
        });
    }
};

module.exports = function(options, addons) {
    let ts = new Transform({objectMode: true});
    try {
        if(!!addons) {
            addons.forEach(addon => {
                includes[addon.name] = addon.includes;
                if(!!addon.excludes) excludes[addon.name] = addon.excludes;
                converters[addon.name] = addon.converter;
            });
        }
        ts._transform = function(file, encoding, cb) {
            let included = false;
            let type = '';
            Object.keys(includes).forEach(i => {
                includes[i].forEach(l => {
                    if(file.path.indexOf(l) === (file.path.length - l.length)) {
                        included = true;
                        type = i;
                        Object.keys(excludes).forEach(m => {
                            excludes[m].forEach(n => {
                                if(file.path.indexOf(n) > -1) {
                                    included = false;
                                    type = '';
                                }
                            });
                        });
                    }
                });
            });
            if(included) {
                if(file.isNull()) {
                    return cb(null, file);
                }
                if(file.isStream()) {
                    return this.emit('error', new PluginError(PLUGIN_NAME, 'Streams not supported!'));
                }
                let opt = {};
                if(!!options && !!options[type]) opt = options[type];
                log(`[${type}] ${file.path}`);
                converters[type](file, opt)
                .then(result => {
                    cb(null, result);
                }, error => {
                    this.emit('error', new PluginError(PLUGIN_NAME, error));
                });
                return;
            } else {
                cb(null, file);
            }
        };
    } catch(e) {
        this.emit('error', new PluginError(PLUGIN_NAME, e.message));
    }
    return  ts;
}