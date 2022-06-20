require('dotenv').config()
const axios = require('axios').default;
const fs = require('fs').promises;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { Chart } = require('chart.js');
const ChartDataLabels = require('chartjs-plugin-datalabels');
const { normalize } = require('path');

const width = 900
const height = 900
const backgroundColour = 'white'
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

    // Core options
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

async function createAndSaveChart(_result, _title, _type, _fileName, _mcap) {
    let config, data
    let colors = getColors(_result[0].length)
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour})
    if (_type != "bubble") {
        data = {
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
            data: data,
        }
    } else {
        Chart.register(ChartDataLabels)
        data = {
            datasets: [{
                data: _result,
                backgroundColor: colors,
            }]
        }
        config = {
            type: _type,
            data: data,
            options: bubbleChartOptions(_title, _mcap)
        }
    }
    const buffer = await chartJSNodeCanvas.renderToBuffer(config)
    await fs.writeFile('./charts/'+_fileName+'.png', buffer, 'base64')
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

async function compareProtocolAToProtocolB(_protocolA, _protocolB) {
    let protocols = await getProtocols();
    let protocolAData = protocols.find(p => p.name == _protocolA)
    let protocolBData = protocols.find(p => p.name == _protocolB)
    // take data
    const tokenAMcap = protocolAData.mcap
    const tokenBMcap = protocolBData.mcap
    const tokenATvl = protocolAData.tvl
    const tokenBTvl = protocolBData.tvl
    // take price of protocol A from coingecko
    let response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${protocolAData.gecko_id}&vs_currencies=usd`)
    const tokenAPrice = response.data[protocolAData.gecko_id].usd
    // calculate change in price and percentage change
    const tokenBMcapTvl = tokenBMcap / tokenBTvl
    const tokenACirculating = tokenAMcap / tokenAPrice
    const tokenAPriceWithTokenBMcapTvl = (tokenBMcapTvl * tokenATvl) / tokenACirculating
    const tokenAPriceChange = tokenAPriceWithTokenBMcapTvl / tokenAPrice
    return [tokenAPriceWithTokenBMcapTvl, tokenAPriceChange]
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
    selected.map(async p => {
        // lower ratio = better tokenomics
        x = p[num] / p[den]
        // higher ratio = better tokenomics
        y = p["mcap"] / p["fdv"]
        // lower market cap = better opportunities 
        // radius is weighted by market cap
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

async function main() {
    // n will be equal to 10 or 20 --> selected from firstN protocols
    // firstN will be equal to 50 or 100
    // best = true --> top performers, false --> top losers
    // day = true --> last day, false --> last week
    // ratio = 0 --> mcap/tvl, 1 --> fdv/tvl, 2 --> mcap/fdv
    const n = 30
    const firstN = 100
    const best = true
    const day = false
    const mcap = false
    // -----------------------------
    // const type = "bar"
    // const result = await getFirstTVLProtocols(n)
    // const title = `Top ${n} protocols for TVL`
    // const fileName = "top_"+n+"_protocols_tvl_"+type
    // -----------------------------
    // const type = "bar"
    // const result = await getBestOrWorseOfFirstNTVL_LastDayOrWeek(n, firstN, best, day)
    // const title = `First ${n} ${best ? "best" : "worse"} performers in top ${firstN} protocols for TVL of ${day ? "last day" : "last week"}`
    // const fileName = `top_${n}_${best ? "best" : "worse"}_performers_${day ? "last_day" : "last_week"}`
    // -----------------------------
    const type = "bubble"
    const result = await getFirstNTVLWithBestRatio(n, firstN, mcap)
    const title = `First ${n} in top ${firstN} protocols with best ${mcap ? "mcap/tvl" : "fdv/tvl"} ratio weighing mcap/fdv`
    const fileName = `top_${n}_protocols_${mcap ? "mcap_tvl" : "fdv_tvl"}`
    // -----------------------------
    await createAndSaveChart(result, title, type, fileName, mcap)
    // -----------------------------
    // const result = await compareProtocolAToProtocolB("MakerDAO", "Curve")
    // console.log(result[0])
    // console.log(result[1])
    // -----------------------------
    // const result = await searchProtocolForName("allbridge")
    // console.log(result)
}

main()