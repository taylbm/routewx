var RTWX = {
    "shsr-visible": true,
    "shsr-opacity": 0.85,
    "animation-delay": 200,
    "animation-duration": 0,
    "total-frames": 30,
    "interval-id": null,
    "current-frame-name": null,
    "tile-root": "https://api.routewx.com/services/",
    "date-slider-init": false,
    "frames": []
}

//Use the async library, to hit the tile api, returning the availables dates (frames)

const getAvailableFrames = async () => {
    const response = await fetch(RTWX["tile-root"]) // get list of available frames
    const frames = await response.json() // parse JSON

    const totalFrames = RTWX["total-frames"]

    RTWX["frames"] = frames

    let firstFrameName = getFrameName(frames[frames.length - totalFrames - 1]["url"])
    let lastFrameName = getFrameName(frames[frames.length - 2]["url"])

    let firstFrameDate = new Date(
        Date.UTC(
            parseInt(firstFrameName.slice(5, 9)),
            parseInt(firstFrameName.slice(9, 11)) - 1,
            parseInt(firstFrameName.slice(11, 13)),
            parseInt(firstFrameName.slice(14, 16)),
            parseInt(firstFrameName.slice(16, 18))
        )
    )

    let lastFrameDate = new Date(
        Date.UTC(
            parseInt(lastFrameName.slice(5, 9)),
            parseInt(lastFrameName.slice(9, 11)) - 1,
            parseInt(lastFrameName.slice(11, 13)),
            parseInt(lastFrameName.slice(14, 16)),
            parseInt(lastFrameName.slice(16, 18))
        )
    )

    $("#date-range-slider").dateRangeSlider({
        bounds: {
            min: firstFrameDate,
            max: lastFrameDate
        },
        step: {
            minutes: 2
        },
        formatter: function(val){
            return val.toLocaleString()
        }
    });
    RTWX["date-slider-init"] = true
}
function showRasterLayer(frameName) {
    if (RTWX["shsr-visible"]) {
        var duration = RTWX["animation-duration"]
        RTWX["current-frame-name"] = frameName
        var opacity = RTWX["shsr-opacity"]
        map.setPaintProperty(frameName, 'raster-opacity-transition', {duration:duration, delay: duration})
        map.setPaintProperty(frameName, 'raster-opacity', opacity)
    }
}
function hideRasterLayer(frameName) {
    var duration = RTWX["animation-duration"]
    map.setPaintProperty(frameName, 'raster-opacity-transition', {duration:duration, delay: duration})
    map.setPaintProperty(frameName, 'raster-opacity', 0)
}
function pauseAnimation() {
    document.getElementById("pause-button").setAttribute("style","background: black;")
    document.getElementById("play-button").setAttribute("style","background: white;")
    clearInterval(RTWX["interval-id"])
}
function visibleClick(checkbox) {
    RTWX[checkbox.id] = checkbox.checked
}
function getFrameName(frameUrl){
    let frameUrlSplit = frameUrl.split("/")
    let frameName = frameUrlSplit[frameUrlSplit.length - 1]
    return frameName
}
function getLayerName(layerDate){
    const isoDateStr = layerDate.toISOString().replaceAll("-","").split("T")[0]
    const hourStr = layerDate.toISOString().split("T")[1].split(":")[0]
    const minuteStr = layerDate.toISOString().split("T")[1].split(":")[1]
    return "shsr-" + isoDateStr + "-" + hourStr + minuteStr
}
function playAnimation() {
    var currentFrame = 0;
    var delay = RTWX["animation-delay"]
    const totalFrames = RTWX["total-frames"]

    document.getElementById("pause-button").setAttribute("style","background: white;")
    document.getElementById("play-button").setAttribute("style","background: black;")
    var layers = map.getStyle().layers
    for (let [key, value] of Object.entries(layers)) {
        if (value.id.includes("shsr")) {
            map.removeLayer(value.id)
            map.removeSource(value.id)
        }
    }

    if (RTWX["date-slider-init"]) {
        $("#date-range-slider").dateRangeSlider("destroy");
    }

    getAvailableFrames()

    RTWX["interval-id"] = setInterval(function () {
        var currentFrameMod = currentFrame % totalFrames
        let currentFrameIdx = RTWX["frames"].length - totalFrames + currentFrameMod - 1

        let currentFrameUrl = RTWX["frames"][currentFrameIdx]["url"]
        let currentFrameName = getFrameName(currentFrameUrl)

        let currentFrameDate = new Date(
            Date.UTC(
                parseInt(currentFrameName.slice(5, 9)),
                parseInt(currentFrameName.slice(9, 11)) - 1,
                parseInt(currentFrameName.slice(11, 13)),
                parseInt(currentFrameName.slice(14, 16)),
                parseInt(currentFrameName.slice(16, 18))
            )
        )

        var shsrLayer = map.getLayer(currentFrameName)
        if (currentFrame > 0) {
            let previousFrameIdx = currentFrameMod == 0 ? RTWX["frames"].length - 2 : RTWX["frames"].length - totalFrames + currentFrameMod - 2
            let previousFrameUrl = RTWX["frames"][previousFrameIdx]["url"]
            let previousFrameName = getFrameName(previousFrameUrl)
            let previousFrameDate = new Date(
                Date.UTC(
                    parseInt(previousFrameName.slice(5, 9)),
                    parseInt(previousFrameName.slice(9, 11)) - 1,
                    parseInt(previousFrameName.slice(11, 13)),
                    parseInt(previousFrameName.slice(14, 16)),
                    parseInt(previousFrameName.slice(16, 18))
                )
            )
            $("#date-range-slider").dateRangeSlider("values", previousFrameDate, currentFrameDate);

            hideRasterLayer(previousFrameName)
        }
        if(typeof shsrLayer == 'undefined') {
            map.addSource(currentFrameName, {
                "type": "raster",
                "scheme": "xyz",
                "tiles": [currentFrameUrl + '/tiles/{z}/{x}/{y}.png'],
                "tileSize": 256,
                "attribution": "Seamless Hybrid-Scan Reflectivity (https://vlab.noaa.gov/web/wdtd/-/seamless-hybrid-scan-reflectivity-shsr-)"
            });

            map.addLayer({
                "id": currentFrameName,
                "type": "raster",
                "source": currentFrameName,
                "paint": {
                    'raster-opacity': RTWX["shsr-opacity"]
                }
            });
        }

        
        showRasterLayer(currentFrameName)
        currentFrame += 1
    }, delay);
}


document.getElementById('shsr-opacity-slider').oninput = function() {
    const val = document.getElementById('shsr-opacity-slider').value
    document.getElementById('shsr-slider-value').innerHTML = val
    RTWX["shsr-opacity"] = parseFloat(val)
};
document.getElementById('animation-delay-slider').oninput = function() {
    const val = document.getElementById('animation-delay-slider').value
    document.getElementById('animation-delay-value').innerHTML = val + " ms"
    RTWX["animation-delay"] = parseInt(val)
    clearInterval(RTWX["interval-id"])
    playAnimation()
};

mapboxgl.accessToken = 'pk.eyJ1IjoibWV0c3RhdGluYyIsImEiOiJja3E5c2p0aW4wMmdlMnJuaGV2OG5yb3RtIn0.cCFZ8mJ12BPtviFQeeajbA';
var mapStyle = {
    'version': 8,
    'name': 'Dark',
    'sources': {
        'mapbox': {
            'type': 'vector',
            'url': 'mapbox://mapbox.mapbox-streets-v8'
        }
    },
    'sprite': 'mapbox://sprites/mapbox/dark-v10',
    'glyphs': 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    'layers': [
        {
            'id': 'background',
            'type': 'background',
            'paint': { 'background-color': '#111' }
        },
        {
            'id': 'water',
            'source': 'mapbox',
            'source-layer': 'water',
            'type': 'fill',
            'paint': { 'fill-color': '#2c2c2c' }
        },
        {
            'id': 'boundaries',
            'source': 'mapbox',
            'source-layer': 'admin',
            'type': 'line',
            'paint': {
                'line-color': '#797979',
                'line-dasharray': [2, 2, 6, 2]
            },
            'filter': ['all', ['==', 'maritime', 0]]
        },
        {
            'id': 'cities',
            'source': 'mapbox',
            'source-layer': 'place_label',
            'type': 'symbol',
            'layout': {
                'text-field': '{name_en}',
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    4,
                    9,
                    6,
                    12
                ]
            },
            'paint': {
                'text-color': '#969696',
                'text-halo-width': 2,
                'text-halo-color': 'rgba(0, 0, 0, 0.85)'
            }
        },
        {
            'id': 'states',
            'source': 'mapbox',
            'source-layer': 'place_label',
            'type': 'symbol',
            'layout': {
                'text-transform': 'uppercase',
                'text-field': '{name_en}',
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-letter-spacing': 0.15,
                'text-max-width': 7,
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    4,
                    10,
                    6,
                    14
                ]
            },
            'filter': ['==', ['get', 'class'], 'state'],
            'paint': {
                'text-color': '#969696',
                'text-halo-width': 2,
                'text-halo-color': 'rgba(0, 0, 0, 0.85)'
            }
        }
    ]
};

var map = new mapboxgl.Map({
    container: 'map',
    maxZoom: 7,
    minZoom: 3,
    zoom: 5,
    center: [-87, 37],
    style: mapStyle,
});


$("#date-range-slider").on("userValuesChanged", function(e, data){
    const layerName = getLayerName(data.values.max)
    hideRasterLayer(RTWX["current-frame-name"])
    showRasterLayer(layerName)
});
map.on('load', function () {
    document.getElementById("datetime-display").innerHTML = Intl.DateTimeFormat().resolvedOptions().timeZone
    playAnimation()
});

setInterval(function () {
    getAvailableFrames()
}, 180000);