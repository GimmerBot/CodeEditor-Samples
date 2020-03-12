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
let useEmaCross: number;

exports.init = async () => {
    enabledStopLoss = false
    stopLoss = -10;
    enabledTakeProfit = false;
    takeProfit = 50;
    enabledTrailingStop = false;
    trailingStart = 60;
    trailingStop = 30;
    renkoDiff = 5;
    periodNoTrade = 1;
    useEmaCross = false;
    crossLine = 0;
}

Date.prototype.addMinutes = function (h) {
    this.setTime(this.getTime() + (h * 60 * 1000));
    return this;
}

exports.tick = async () => {

    let emaFast = await context.indicators.ema(context.historicalData.close, 5);
    let emaLong = await context.indicators.ema(context.historicalData.close, 68);

    let emaF: number = emaFast[0][emaFast[0].length - 1];
    let emaL: number = emaLong[0][emaLong[0].length - 1];

    let buy = emaF > emaL;
    let cross: number = Math.abs(100 * (emaF - emaL) / ((emaF + emaL) / 2));
    //console.log(`cross: ${cross}`);

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

    let items = [];
    for (let i = 0; i < context.historicalData.close.length; i++) {
        items.push([
            context.historicalData.timestamp[i],
            context.historicalData.close[i]
        ])
    }

    items.push([
            new Date().getTime(),
            context.price
        ])
    let result = linearDataToRenko(items, renkoDiff);
    let side = ''

    if (emaF > emaL) {
        side = result[result.length - 1].side == 'buy' &&
            (!crossLine || !!crossLine && cross > crossLine) &&
            (!useEmaCross || useEmaCross && buy) ? 'buy' : 'close';
    }
    else {
        side = result[result.length - 1].side == 'sell' &&
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

function linearDataToRenko(data, change) {
    var renkoData = [],
        prevPrice = data[0][1],
        prevTrend = 0, // 0 - no trend, 1 - uptrend, 2 - downtrend
        length = data.length,
        i = 1;


    for (; i < length; i++) {
        if (data[i][1] - data[i - 1][1] > change) {
            // Up trend

            if (prevTrend === 2) {
                prevPrice += change;
            }

            renkoData.push({
                x: data[i][0],
                y: prevPrice,
                low: prevPrice,
                high: prevPrice + change,
                side: 'buy'
            });

            prevPrice += change;
            prevTrend = 1;

        } else if (Math.abs(data[i][1] - data[i - 1][1]) > change) {

            if (prevTrend === 1) {
                prevPrice -= change;
            }
            // Down trend
            renkoData.push({
                x: data[i][0],
                y: prevPrice,
                low: prevPrice - change,
                high: prevPrice,
                side: 'sell'
            });

            prevPrice -= change;
            prevTrend = 2;
        }
    }
    return renkoData;
}