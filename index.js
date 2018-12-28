const PluginError = require('plugin-error')
const Transform = require('stream').Transform;
const UglifyJS = require("uglify-js");
const uglifycss = require('uglifycss');
const imagemin = require('imagemin');
const minify = require('html-minifier').minify;
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminSvgo = require('imagemin-svgo');

const PLUGIN_NAME = 'multimin';

const includes = {
    javascript: ['.js'],
    html: ['.html', '.htm'],
    css: ['.css'],
    image: ['.jpeg', '.jpg', '.png', '.gif', '.svg']
};

const excludes = {
    javascript: ['.min.js'],
    css: ['.min.css']
};

const converters = {
    javascript: function(input, options) {
        //console.log('javascript');
        let option = options || {};
        let data = input.toString('utf8');
        return new Promise((resolve, reject) => {
            try {
                let result = UglifyJS.minify(data, option);
                if(!!result.error) {
                    resolve(input);
                } else {
                    let buf = Buffer.from(result.code, 'utf8')
                    resolve(buf);
                }
            } catch(e) {
                reject(e.message);
            }
        });
    },
    html: function(input, options) {
        //console.log('html');
        let option = {};
        Object.keys(options).forEach(k => {
            option[k] = options[k];
        });
        let data = input.toString('utf8');
        return new Promise((resolve, reject) => {
            try {
                resolve(Buffer.from(minify(data, option), 'utf8'));
            } catch(e) {
                reject(e.message);
            }
        });
    },
    css: function(input, options) {
        //console.log('css');
        let option = {};
        Object.keys(options).forEach(k => {
            option[k] = options[k];
        });
        let data = input.toString('utf8');
        return new Promise((resolve, reject) => {
            try {
                resolve(Buffer.from(uglifycss.processString(data, option), 'utf8'));
            } catch(e) {
                reject(e.message);
            }
        });
    },
    image: function(input, options) {
        //console.log('image');
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
        try {
            return imagemin.buffer(input, option);
        } catch(e) {
            reject(e.message);
        }
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
                    if(file.path.indexOf(l) > -1) {
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
                converters[type](file.contents, opt)
                .then(result => {
                    file.contents = result;
                    cb(null, file);
                }, error => {
                    console.log(file.path);
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