/**
 * Javascript code for creating a map of groundwater changes. 
 *
 * Uses the Google Maps Javascript API. Custom tiles are used to display the data
 * quickly. These should be specified with 'tiles_url', and can be generated
 * with kml_to_tiles.py.
 *
 * Additionally, a maximum (blue) and minimum (red) along with units for the legend.
 *
 * Author: Vince Kurtz
 *
 */

var tiles_url = '../../map_tiles/grace_2002-2015/';
var graph_url = '../../graphs/grace_2002-2015/';
var legend_unit = "cm/month";
var legend_file = "./legend.txt";

var default_zoom = 2;
var default_center = {lat: 42, lng: 0};

var TILE_SIZE = 256;

function initMap() {
    var map = new google.maps.Map(document.getElementById('map'), {
        zoom: default_zoom,
        center: default_center,
        maxZoom: 6,
        minZoom: 2,
        mapTypeId: "hybrid"   // underlying map with satellite images and borders
    });

    // Insert this overlay map type as the first overlay map type at
    // position 0. Note that all overlay map types appear on top of
    // their parent base map.
    var customTiles = new google.maps.ImageMapType({
        getTileUrl: function(coord, zoom) { 
            var max_tile = Math.pow(2,zoom);
            if (coord.y < 0 || coord.y > (max_tile - 1)) {
                return null;   // don't try to display things we don't have
            }

            return [tiles_url, zoom, '/', mod(coord.x, max_tile), '/', coord.y, '.png'].join(''); 
        },

        tileSize: new google.maps.Size(256, 256),
        isPng: true,

    });

    // Add a button to recenter the map
    var centerControlDiv = document.createElement('div');
    var centerControl = new CenterControl(centerControlDiv, map);
    centerControlDiv.index = 1;
    map.controls[google.maps.ControlPosition.LEFT_TOP].push(centerControlDiv);

    // Set up the legend
    $.ajax({ 
        url: legend_file, 
        success: function(file_content) {
            var arrs = $.csv.toArrays(file_content);    // convert csv to nested arrays
            initLegend(arrs,legend_unit);     // call initLegend here so it runs once the file is loaded
            map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);
        }
    });

    // Set up info windows
    var coordInfoWindow = new google.maps.InfoWindow();
    map.addListener('click', function(e) {
        var myzoom = map.getZoom();
        var mycoord = e.latLng;   // get the latitude and longitude of the click event

        // find lat/lon of the center of the pixel that was clicked
        center = new google.maps.LatLng({"lat": Math.floor(mycoord.lat())+0.5, "lng": Math.floor(mycoord.lng()) + 0.5});

        // find the url that would correspond to a plot for this pixel
        var lat = center.lat();
        var lon = center.lng();
        var image_url = graph_url + lon + ',%20' + lat + '%20Data.jpg'   // use relative paths to avoid xss problems
        
        // check if there is a graph for us to display
        var request = new XMLHttpRequest();
        request.open('GET', image_url, false);  // false means sycnchronous
        request.send()
        if (request.status === 200) {
            // there is a graph for us! Set up and display the popup
            coordInfoWindow.setContent(createInfoWindowContent(center, myzoom, image_url));
            coordInfoWindow.setPosition(center);
            coordInfoWindow.open(map);
        } else {
            // the graph image can't be reached, so we won't load a popup
            // instead we'll close one (if it's up already)
            coordInfoWindow.close();
        }
    });

    map.overlayMapTypes.insertAt(0, customTiles);
}

function createInfoWindowContent(latLng, zoom, image_url) {
	// Create an infowindow about the pixel that was clicked
	return [
		'Total Water Storage for ' + latLng,
        '<img style="height:330px;width:420px" src="' + image_url + '"></img>'
	].join('<br>');
}

function project(latLng) {
    // The mapping between latitude, longitude and pixels is defined by the web
    // mercator projection.
    var siny = Math.sin(latLng.lat() * Math.PI / 180);

    // Truncating to 0.9999 effectively limits latitude to 89.189. This is
    // about a third of a tile past the edge of the world tile.
    siny = Math.min(Math.max(siny, -0.9999), 0.9999);

    return new google.maps.Point(
        TILE_SIZE * (0.5 + latLng.lng() / 360),
        TILE_SIZE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)));
}

function initLegend(legend_array, units) {
    // Create a legend based on the given array of
    // value - color pairs
    var legend = document.getElementById('legend');
    var div = document.createElement('div');

    var html = "<p style='text-align:center;'>Change in TWS<br/>"+units+"</p>";

    // Get representative colors
    var val;
    var color;
    var slots = 25;
    var arrlen = legend_array.length;
    html += "<div style='font-size:small;'>";
    for (var i=0; i<arrlen; i++) {
        val = legend_array[i][0];
        color = legend_array[i][1];
        html += "<div style='text-align:center;width:100%;height:15px;background-color:"+color+";margin:1px;'>" + val + "</div>";
    }
    html += "</div>";

    // Create the rest of the html
    div.innerHTML = html;
    legend.innerHTML = '<h3>Legend</h3>';  // clear old content, but keep the heading
    legend.appendChild(div);
}

function getColor(val, max) {
    // choose a color that represents the value 'val' on  a scale
    // from min to max. Blue is very positive, white is zero, red is very negative.
    //
    // Assumes that min = -max.
    //
    // This wierd math to generate a gradient comes from kmlify.pl

    var red, green, blue;

    var A = 500;  // scaling factors for the gradient
    var B = max/2;

    if (val < 0 ) {
        // negative value --> decreasing groundwater --> red
        red = 255;
        var loss = A * Math.exp(val/B);
        if (loss>255) {
            green = 255;
            blue = loss - 255;
        } else {
            green = loss;
            blue = 0;
        }
    } else if (val >= 0) {
        // positive value --> increasing groundwater --> blue
        blue = 255;
        var gain = A * Math.exp(-val/B);
        if (gain > 255) {
            green = 255;
            red = gain - 255;
        } else {
            green = gain;
            red = 0;
        }
    } else {
        red = .5;
        blue = .5;
        green = .5;
    }

    rgb = [red, green, blue];
    return '#' + rgb.map(function(x){
        return ("0" + Math.round(x).toString(16)).slice(-2);  // convert from 0-255 to 00-FF for each color
    }).join('');
}

function CenterControl(controlDiv, map) {
    // create control box to recenter the map
    // @constructor

    // Set CSS for the control border.
    var controlUI = document.createElement('div');
    controlUI.style.backgroundColor = '#fff';
    controlUI.style.border = '2px solid #fff';
    controlUI.style.borderRadius = '3px';
    controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    controlUI.style.cursor = 'pointer';
    controlUI.style.marginBottom = '22px';
    controlUI.style.marginLeft = '10px';
    controlUI.style.textAlign = 'center';
    controlUI.title = 'Click to recenter the map';
    controlDiv.appendChild(controlUI);

    // Set CSS for the control interior.
    var controlText = document.createElement('div');
    controlText.style.color = 'rgb(25,25,25)';
    controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
    controlText.style.fontSize = '12px';
    controlText.style.lineHeight = '20px';
    controlText.style.paddingLeft = '5px';
    controlText.style.paddingRight = '5px';
    controlText.innerHTML = 'Re-center Map';
    controlUI.appendChild(controlText);

    // Setup the click event listeners: simply set the map to look at GC
    controlUI.addEventListener('click', function() {
        map.setCenter(default_center);
        map.setZoom(default_zoom);
    });
}

function mod(n, m) {
    // Return n mod m. Since javascript is too silly to do it right themselves
    return ((n % m) + m) % m;
}


