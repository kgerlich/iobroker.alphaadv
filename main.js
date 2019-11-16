/**
 *
 * alphaadvantage adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "alphaadv",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js alphaadv Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@alphaadv.com>"
 *          ]
 *          "desc":         "alphaadvantage adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42,
 *          "mySelect": "auto"
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils = require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.alphaadv.0
const adapter = new utils.Adapter('alphaadv');

const https = require('https');
const util = require('util')
const prettyMs = require('pretty-ms');

function format(fmt, ...args) {
    if (!fmt.match(/^(?:(?:(?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{[0-9]+\}))+$/)) {
        throw new Error('invalid format string.');
    }
    return fmt.replace(/((?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{([0-9]+)\})/g, (m, str, index) => {
        if (str) {
            return str.replace(/(?:{{)|(?:}})/g, m => m[0]);
        } else {
            if (index >= args.length) {
                throw new Error('argument index is out of range in format');
            }
            return args[index];
        }
    });
}

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

adapter.on('stateChange', function (id, state) {
});

function create_indicator(name, description, value) {
    adapter.getObject(name, function(err, obj) { 
        if (!obj) {
            adapter.setObject(name, {
                type: value == null ? '' : 'state',
                common: {
                    name: description,
                    role: 'state',
                    type: "boolean",
                    "read":  true,
                    "write": false
                    },
                native: {}
            });
            if (value != null) {
                adapter.setState(name, value, true);
            }
        }
    });
    adapter.setState(name, value, true);
}

function get_api_key() {
    return adapter.config.apikey.trim();
}

function get_function_url(symbol, _function) {
    return 'https://www.alphavantage.co/query?function=' + _function + '&datatype=json&symbol=' + symbol + '&apikey=' + get_api_key();    
}

// generalised query, calls decoder(callback) from cb_data
function query(url, cb_data) {
    https.get(url, function(res){
        var body = '';
    
        res.on('data', function(chunk){
            body += chunk;
        });
    
        res.on('end', function(){
            var fbResponse = JSON.parse(body);
            console.log("Got a response: ", fbResponse);
            cb_data.decoder(cb_data, fbResponse);
    });
    }).on('error', function(e){
        console.log("Got an error: ", e);
    });    
}

function get_global_quote_decoder(cb_data, fbResponse) {
    var data = fbResponse["Global Quote"]

    var symbol = data['01. symbol'];
    var open = data['02. open'];
    var high = data['03. high'];
    var low = data['04. low'];
    var price = data['05. price'];
    var vol  = data['06. volume'];
    var date = data['07. latest trading day'];
    var prev = data['08. previous close'];
    var change = data['09. change'];
    var change_percent = data['10. change percent'];
    cb_data.cb(
        cb_data.symbol,
        {
        'symbol': symbol,
        'open': open, 
        'high': high, 
        'low': low, 
        'price': price, 
        'vol': vol, 
        'date': date, 
        'prev': prev, 
        'change': change, 
        'percent': change_percent
    });
}

function create_global_quote_states(symbol, data) {
    adapter.log.debug(data);
    create_indicator( symbol, symbol, null);
    create_indicator(symbol + '.day', symbol + ' GLOBAL_QUOTES', null);
    for (var key in data) {
        create_indicator(symbol + '.day.' + key , key, data[key]);
    }
}

function get_global_quote(symbol) {
    adapter.log.info('get_global_quote(): ' + symbol);

    var url = get_function_url(symbol, 'GLOBAL_QUOTE');
    var cb_data = {
        'symbol': symbol,
        'cb': create_global_quote_states,
        'decoder': get_global_quote_decoder
    };

    query(url, cb_data);
}

function update_stock_data() {
    adapter.config.symbols.forEach( function(item, index) {
        get_global_quote(item.trim());
    });
    setTimeout(update_stock_data, 15*1000);
}

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('config APIKEY: ' + adapter.config.apikey);

    // in this all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    // fill up adapter objects
    update_stock_data();
}




/// 

//function get_time_series_daily(symbol) {
    //     adapter.log.info('get_aa(): ' + symbol);
    //     var url = 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&datatype=json&symbol=' + symbol + '&interval=1min&apikey=' + adapter.config.apikey.trim();
    //     https.get(url, function(res){
    //         var body = '';
        
    //         res.on('data', function(chunk){
    //             body += chunk;
    //         });
        
    //         res.on('end', function(){
    //             var fbResponse = JSON.parse(body);
    //             console.log("Got a response: ", fbResponse);
    //             var meta_data = fbResponse["Meta Data"];
    //             var data = fbResponse["Time Series (Daily)"]            
    //             var last_refreshed = meta_data['3. Last Refreshed'];
    //             var i = data[last_refreshed];
    //             var value_open = i['1. open'];
    //             var value_close = i['4. close'];
    //             var volume = i['5. volume'];
    //             create_indicator('symbols', 'Stock symbols', null);
    //             create_indicator('symbols.' + symbol + '.date', 'Date', last_refreshed);
    //             create_indicator('symbols.' + symbol + '.open', 'Value at open', value_open);
    //             create_indicator('symbols.' + symbol + '.close', 'Value at close', value_close);
    //             create_indicator('symbols.' + symbol + '.volume', 'Days volume', volume);
    //     });
    //     }).on('error', function(e){
    //         console.log("Got an error: ", e);
    //     });    
    // }
    