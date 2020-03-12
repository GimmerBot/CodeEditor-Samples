let enabledStopLoss: boolean;
let stopLoss: number; // percentage
let enabledTakeProfit: boolean;
let takeProfit: number; // percentage
let enabledTrailingStop: boolean;
let trailingStop: number; // percentage
let trailingStart: number; // percentage
let renkoDiff: number; // price
let periodNoTrade: number; // hours
let crossLine: number;
let useEmaCross: boolean;

exports.init = async () => {
    enabledStopLoss = true
    stopLoss = -80;
    enabledTakeProfit = false;
    takeProfit = 50;
    enabledTrailingStop = true;
    trailingStart = 60;
    trailingStop = 30;
    renkoDiff = 0.30;
    periodNoTrade = 60;
    useEmaCross = true;
    crossLine = 0;
}

Date.prototype.addMinutes = function (h) {
    this.setTime(this.getTime() + (h * 60 * 1000));
    return this;
}

exports.tick = async () => {

    let emaFast = await context.indicators.ema(context.historicalData.close, 34);
    let emaLong = await context.indicators.ema(context.historicalData.close, 144);

    let emaF: number = emaFast[0][emaFast[0].length - 1];
    let emaL: number = emaLong[0][emaLong[0].length - 1];

    let buy = emaF > emaL;
    let cross: number = 100 * (emaF - emaL) / ((emaF + emaL) / 2);
    

    // trailing stop
    if (enabledTrailingStop && context.position && context.state.trailingPerformance > trailingStart && context.position.performance != 0) {
        let diff = context.position.performance - context.state.trailingPerformance / context.state.trailingPerformance * 100;
        if (diff < -trailingStop) {
            console.log(`Trailing Stop: ${context.position.performance}%`);
            return closePosition();
        }
    }

    // take profit 
    if (enabledTakeProfit && context.position && context.position.performance > takeProfit) {
        console.log(`Take Profit: ${context.position.performance}%`);
        return closePosition();
    }

    // stop loss
    if (enabledStopLoss && context.position && context.position.performance < stopLoss) {
        console.log(`Stop Loss: ${context.position.performance}%`);
        return closePosition();
    }

    if (context.position) {
        if (context.position.performance > (context.state.trailingPerformance || 0)) {
            context.state.trailingPerformance = context.position.performance;
        }
    }
    else {
        context.state.trailingPerformance = 0;
    }

    let lastItems = context.historicalData.data.slice(Math.max(context.historicalData.data.length - 10, 0));
    let result = heikinAshi(lastItems);
    let side = ''

    if (emaF > emaL) {
        side = result[result.length - 1].open < result[result.length - 1].close &&
            (!crossLine || !!crossLine && cross > crossLine) &&
            (!useEmaCross || useEmaCross && buy) ? 'buy' : 'close';
    }
    else {
        side = result[result.length - 1].open > result[result.length - 1].close &&
            (!crossLine || !!crossLine && cross < -crossLine) &&
            (!useEmaCross || useEmaCross && !buy) ? 'sell' : 'close';
    }

    if (result.length) {
        if (side != context.state.side &&
            (!context.state.closeDate || context.state.closeDate < new Date(context.timestamp).getTime())) {

            context.state.lastOpen = context.historicalData.open[context.historicalData.open.length - 1];
            context.state.side = side;

            if (context.position && side) {
                return closePosition();
            }
            else {
                context.state.trailingPerformance = 0;
            }

            console.log(`Heikin Open ${context.state.side}`);

            console.log(`cross: ${cross}`);
            return context.state.side;
        }
    }

    return "";
}

let closePosition = () => {
    console.log(`Close: ${context.position.performance}%`);
    context.state.side = "";
    context.state.trailingPerformance = 0;
    context.state.closeDate = new Date(context.timestamp).addMinutes(periodNoTrade).getTime();
    return 'close';
}

exports.end = async () => {
}

/**
 * Converts OHLC data to Heikin-Ashi based on the following:
 * HA-Close = (Open(0) + High(0) + Low(0) + Close(0)) / 4
 * HA-Open = (HA-Open(-1) + HA-Close(-1)) / 2
 * HA-High = MAX (High(0), HA-Open(0) or HA-Close(0))
 * HA-Low = Min (Low(0), HA-Open(0) or HA-Close(0) )
 * @param {Array} ohlc Array of ohlc values
 * @param {object} options 
 */
let heikinAshi = (
    ohlc,
    options = {
        overWrite: false,
        formatNumbers: false,
        decimals: 4,
        forceExactDecimals: false
    }
) => {
    let overWrite = options.overWrite || false;
    let formatNumbers = options.formatNumbers || false;
    let decimals = options.decimals || 4;
    let forceExactDecimals = options.forceExactDecimals || false;

    if (!ohlc || ohlc.length === 0) {
        return [];
    }

    let result = [];
    for (let i = 0; i < ohlc.length; i++) {
        const element = ohlc[i];

        let haCandle;
        if (overWrite) {
            haCandle = element;
        } else {
            haCandle = JSON.parse(JSON.stringify(element));
        }
        haCandle.close = (element.open + element.high + element.low + element.close) / 4;
        if (formatNumbers) {
            haCandle.close = formatNumbersFunc(haCandle.close, decimals, forceExactDecimals);
        }

        if (i > 0) {
            const result_1 = result[i - 1];
            haCandle.open = (result_1.open + result_1.close) / 2;
            if (formatNumbers) {
                haCandle.open = formatNumbersFunc(haCandle.open, decimals, forceExactDecimals);
            }
            haCandle.high = Math.max(element.high, haCandle.open, haCandle.close);
            haCandle.low = Math.min(element.low, haCandle.open, haCandle.close);
        }
        result.push(haCandle);
    }
    return result;
}
//-----------------------------------------------------------------------------
/**
 * Sets the number of significant digits based on the number's value and its parameters.
 * If forceExactDecimals is false, the bigger the value, the lower the number of significant digits
 * @param {Number} value 
 * @param {Number} decimal=4
 * @param {boolean} forceExactDecimals=false
 */
let formatNumbersFunc = (value, decimals = 4, forceExactDecimals = false) => {
    let maxDecimals = 8;
    try {
        if (!value) {
            return value;
        }

        if (!isNaN(value)) {
            value = parseFloat(value);
        }
        if (forceExactDecimals) {
            return parseFloat(value.toFixed(decimals));
        }

        if (value < 1) {
            return parseFloat(value.toFixed(maxDecimals));
        } else if (value > 1000) {
            decimals = 0;
        } else if (value > 100) {
            decimals = 2;
        }

        return parseFloat(value.toFixed(decimals));
    } catch (error) {
        console.log("value: ", JSON.stringify(value));
        console.log("FixNumberPipe Error: ", error);
    }
}
