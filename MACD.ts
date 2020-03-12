let enabledStopLoss: boolean;
let stopLoss: number; // percentage
let enabledTakeProfit: boolean;
let takeProfit: number; // percentage
let enabledTrailingStop: boolean;
let trailingStop: number; // percentage
let trailingStart: number; // percentage
let fastPeriod: number;
let slowPeriod: number;
let signalPeriod: number;
let periodNoTrade: number; // hours


exports.init = async () => {
    fastPeriod = 19;
    slowPeriod = 26;
    signalPeriod = 9;
}

Date.prototype.addMinutes = function (h) {
    this.setTime(this.getTime() + (h * 60 * 1000));
    return this;
}

exports.tick = async () => {

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


    let side = ''

    let macdData = await context.indicators.macd(context.historicalData.close,
        fastPeriod,
        slowPeriod,
        signalPeriod);

    let macd: number = macdData[0][macdData[0].length - 1];
    let signal: number = macdData[1][macdData[1].length - 1];
    let history: number = macdData[2][macdData[2].length - 1];

    let buy = macd >= signal;
    let sell = macd < signal;

    if (buy) {
        side = "buy";
    } else if (sell) {
        side = "sell";
    }

    if (side != context.state.side &&
        (!context.state.closeDate || context.state.closeDate < new Date(context.timestamp).getTime())) {

        context.state.lastOpen = context.historicalData.open[context.historicalData.open.length - 1];
        context.state.side = side;

        if (!context.position) {
            context.state.trailingPerformance = 0;
        }

        console.log(`Heikin Open ${context.state.side}`);
        return context.state.side;
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