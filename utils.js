const axios = require('axios').default;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { Chart } = require('chart.js');
const ChartDataLabels = require('chartjs-plugin-datalabels');

const smallChartJSNodeCanvas = new ChartJSNodeCanvas({ width: 900, height: 900, backgroundColour: 'white'})
const bigChartJSNodeCanvas = new ChartJSNodeCanvas({ width: 1500, height: 1500, backgroundColour: 'white'})

const bubbleChartOptions = (_title, _mcap) => options = {
    plugins: {
        datalabels: {
            align: function(context) {
                value = context.dataset.data[context.dataIndex]
                if (value[2] < 10 || (value[2] < 20 && value[3].length > 7)) 
                    return "end" 
            },
            color: function() {
                return 'black';
            },
            font: {
                weight: 'bold'
            },
            formatter: function(value) {
                return value[3]
            },
            offset: function(context) {
                value = context.dataset.data[context.dataIndex]
                if (value[2] < 10)
                    return 7
                else if (value[2] < 20 && value[3].length > 7) {
                    return 15
                }
            },
            padding: 0
        },
        legend: {
            display: false
        },
        title: {
            display: true,
            text: _title,
            font: {
                size: 25
            },
            padding: {
                top: 10,
                bottom: 40
            }
        }
    },

    layout: {
        padding: 16
    },

    scales: {    
        x: {
            title: {
                display: true,
                text: function() {
                    if (_mcap) 
                        return "mcap / tvl"
                    else
                        return "fdv / tvl"
                },  
                font: {
                    size: 20
                },
                padding: {
                    top: 20,
                    bottom: 10
                }
            }
        },
        y: {
            title: {
                display: true,
                text: "mcap / fdv",
                font: {
                    size: 20
                },
                padding: {
                    top: 20,
                    bottom: 10
                }
            }
        }
    }
}

async function createAndSaveChart(_big, _result, _title, _type, _mcap) {
    let config, myData
    let colors = getColors(_result[0].length)
    if (_type != "bubble") {
        myData = {
            labels: _result[0],
            datasets: [{
                label: _title,
                data: _result[1],
                backgroundColor: colors,
                hoverOffset: 4
            }]
        }
        config = {
            type: _type,
            data: myData,
        }
    } else {
        Chart.register(ChartDataLabels)
        myData = {
            datasets: [{
                data: _result,
                backgroundColor: colors,
            }]
        }
        config = {
            type: _type,
            data: myData,
            options: bubbleChartOptions(_title, _mcap)
        }
    }
    let buffer
    _big ? 
        buffer = await bigChartJSNodeCanvas.renderToBuffer(config) :
        buffer = await smallChartJSNodeCanvas.renderToBuffer(config)
    if (_type == "bubble") Chart.unregister(ChartDataLabels)
    return buffer
}

function getColors(_n) {
    const COLORS = [
        '#4dc9f6',
        '#f67019',
        '#f53794',
        '#537bc4',
        '#acc236',
        '#166a8f',
        '#00a950',
        '#58595b',
        '#8549ba'
    ];
    let colors = [];
    for(i = 0; i < _n; ++i) {
       colors.push(COLORS[i % COLORS.length])
    }
    return colors;
}

async function getProtocols() {
    let response = await axios.get('https://api.llama.fi/protocols')
    let protocols = response.data;
    // we'll exclude wBTC, hBTC and others
    protocols = protocols.filter(p => !p.name.includes("BTC"))
    return protocols
}

async function getFirstTVLProtocols(_n) {
    let _apiLabels, _apiData
    let protocols = await getProtocols();
    let selected = protocols.slice(0, _n)
    _apiLabels = selected.map(p => p.name)
    _apiData = selected.map(p => p.tvl)
    return [_apiLabels, _apiData]
}

async function getBestOrWorseOfFirstNTVL_LastDayOrWeek(_n, _firstN, _best, _day) {
    let _apiLabels, _apiData
    let protocols = await getProtocols();
    let change
    _day ? change = "change_1d" : change = "change_7d"
    protocols = protocols.filter(p => p[change] != null)
    let selected = protocols.slice(0, _firstN)
    _best ?
        selected = selected.sort((a, b) => b[change] - a[change])
    :
        selected = selected.sort((a, b) => a[change] - b[change])  
    selected = selected.slice(0, _n)
    _apiLabels = selected.map(p => p.name)
    _apiData = selected.map(p => p[change])
    return [_apiLabels, _apiData]
}

async function getFDVFromCoingecko(_id) {
    // could die because of delistings or too many requests
    try {
        let response = await axios.get(`https://api.coingecko.com/api/v3/coins/${_id}`)
        let price = response.data.market_data.current_price.usd
        let fdv = response.data.market_data.total_supply * price
        return fdv
    } catch(err) {
        console.log("ERROR: Coingecko ded")
        return 0
    }
}

// this function takes a value which belongs to a range and 
// fits it into a new value based on a new range 
function normalizeData(_value, _initRange, _finalRange) {
    return  (_value - _initRange[0]) / 
            (_initRange[1] - _initRange[0])*
            (_finalRange[1] - _finalRange[0]) +
            _finalRange[0]
}

async function getFirstNTVLWithBestRatio(_n, _firstN, _mcap) {
    let x, y, r, label, num, den
    let protocols = await getProtocols();
    protocols = protocols.filter(p => p.mcap != 0 && p.tvl != 0)
    let selected = protocols.slice(0, _firstN)
    // not everytime FDV is defined, and it's the only parameter we can 
    // calculate using coingecko
    await Promise.all(
        selected.map(async p => {
            if (isNaN(p.fdv)) {
                if(p.gecko_id) {
                    p.fdv = await getFDVFromCoingecko(p.gecko_id)
                }
            }
        })
    )
    _mcap ? ( num = "mcap", den = "tvl" ) : ( num = "fdv", den = "tvl" )
    selected = selected.sort((a, b) => a[num] / a[den] - b[num] / b[den])
    selected = selected.slice(0, _n)
    let data = []
    selected.map(p => {
        // lower ratio = better tokenomics
        x = p[num] / p[den]
        // higher ratio = better tokenomics
        y = p["mcap"] / p["fdv"]
        // lower market cap = better opportunities 
        r = p["mcap"] / 10**7
        label = p.name
        data.push([x,y,r,label])
    })
    data = data.filter(d => !isNaN(d[2]))
    // as the range of protocols market cap is pretty big,
    // we need to normalize the data, and set a new range
    let initRange = [
        Math.min(...data.map(d => d[2])),
        Math.max(...data.map(d => d[2])),
    ]
    // a radius will have values in this new range
    let finalRange = [3, 50]
    data = data.map(d => [
        d[0], 
        d[1], 
        normalizeData(d[2], initRange, finalRange), 
        d[3]]
    )
    return data
}

function setImageSize(_n, _type) {
    if (_n > 25 && _type == "bar") {
        return true
    } else {
        return false
    }
}

/**
 *  EXPORTING FUNCTIONS
 */

async function searchProtocolForName(_name) {
    let protocols = await getProtocols();
    let protocol = protocols.filter(
        p => p.name
                .toLowerCase()
                .replace(" ","")
                .includes(
                    _name
                    .toLowerCase()
                    .replace(" ","")
                )
    )
    return protocol
}

async function searchProtocolForSymbol(_symbol) {
    let protocols = await getProtocols();
    let protocol = protocols.filter(p => p.symbol.toLowerCase().includes(_symbol.toLowerCase()))
    return protocol
}

async function compareProtocolAToProtocolB(protocolAData, protocolBData) {
    // take data
    const tokenAMcap = protocolAData.mcap
    const tokenBMcap = protocolBData.mcap
    const tokenATvl = protocolAData.tvl
    const tokenBTvl = protocolBData.tvl
    // take price of protocol A from coingecko
    let response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${protocolAData.gecko_id}&vs_currencies=usd`
    )
    const tokenAPrice = response.data[protocolAData.gecko_id].usd ?? undefined
    // calculate change in price and percentage change
    if (tokenAPrice) {
        const tokenBMcapTvl = tokenBMcap / tokenBTvl
        const tokenACirculating = tokenAMcap / tokenAPrice
        const tokenAPriceWithTokenBMcapTvl = (tokenBMcapTvl * tokenATvl) / tokenACirculating
        const tokenAPriceChange = tokenAPriceWithTokenBMcapTvl / tokenAPrice
        return [tokenAPriceWithTokenBMcapTvl, tokenAPriceChange]
    } else {
        return [0, 0]
    }
}

async function getFirstTVLProtocolsChart(_n, _type) {
    let big = setImageSize(_n, _type)
    let result = await getFirstTVLProtocols(_n)
    let title = `Top ${_n} protocols for TVL`
    let bufferImg = await createAndSaveChart(big, result, title, _type)
    return bufferImg
}

async function getTopPerformersChart(_firstN, _n, _best, _day, _type) {
    let big = setImageSize(_n, _type)
    let result = await getBestOrWorseOfFirstNTVL_LastDayOrWeek(_n, _firstN, _best, _day)
    let title = `First ${_n} ${_best ? "best" : "worse"} performers in top ${_firstN} protocols for TVL of ${_day ? "last day" : "last week"}`
    let bufferImg = await createAndSaveChart(big, result, title, _type)
    return bufferImg
}

async function getBestRatioChart(_firstN, _n, _mcap) {
    let result = await getFirstNTVLWithBestRatio(_n, _firstN, _mcap)
    let title = `First ${_n} in top ${_firstN} protocols with best ${_mcap ? "mcap/tvl" : "fdv/tvl"} ratio weighing mcap/fdv`
    let bufferImg = await createAndSaveChart(false, result, title, "bubble", _mcap)
    return bufferImg
}

module.exports = {
    searchProtocolForName, 
    searchProtocolForSymbol,
    compareProtocolAToProtocolB,
    getFirstTVLProtocolsChart,
    getTopPerformersChart,
    getBestRatioChart,
}