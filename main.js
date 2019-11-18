/**
 *
 * alphaadvantage adapter
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

const CALL_COUNTER_NAME = "calls";

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
                adapter.setStateChanged(name, value, true);
            }
        }
    });
    adapter.setStateChanged(name, value, true);
}

function increment_call_counter() {
    adapter.getState(CALL_COUNTER_NAME , (err, state) => {
        adapter.log.debug("Calls = " + state.val);
        var date = new Date(state.ts);
        console.log(date);
        adapter.setState(CALL_COUNTER_NAME, state.val + 1, 1);
    });
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
            adapter.log.debug("Got a response: " + util.inspect(fbResponse, {showHidden: false, depth: null}));
            increment_call_counter();
            cb_data.decoder(cb_data, fbResponse);
    });
    }).on('error', function(e){
        adapter.log.debug("Got an error: " + util.inspect(e, {showHidden: false, depth: null}));
    });    
}

function get_global_quote_decoder(cb_data, fbResponse) {
    try {
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
    } catch(e) {
        adapter.log.debug("Exception caught: " + util.inspect(e, {showHidden: false, depth: null}));
        if ('Note' in fbResponse) {
            adapter.log.debug("Note: " + fbResponse.Note);
        }
    }
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
    adapter.log.debug('get_global_quote(): ' + symbol);

    var url = get_function_url(symbol, 'GLOBAL_QUOTE');
    var cb_data = {
        'symbol': symbol,
        'cb': create_global_quote_states,
        'decoder': get_global_quote_decoder
    };

    query(url, cb_data);
}

function update_stock_data(timeout) {
    // handle invalid timeout
    if (timeout == undefined || timeout < 15*1000) {
        timeout = 120*1000; // 120 sec
    } 
    create_indicator('numsym', 'Number of symbols', adapter.config.symbols.length);
    create_indicator('timeout', 'Time between refreshes', timeout);
    create_indicator(CALL_COUNTER_NAME, 'API calls made', 0);

    adapter.config.symbols.forEach( function(item, index) {
        get_global_quote(item.trim());
    });
    setTimeout(update_stock_data, timeout);
}

function main() {
    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.debug('config APIKEY: ' + adapter.config.apikey);
    adapter.log.debug('config timeout: ' + adapter.config.timeout);

    // in this all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    if(!adapter.config.apikey) {
        adapter.log.info('You need to set an API key!');
        return;
    }
    
    // fill up adapter objects
    update_stock_data(adapter.config.timeout);
}
