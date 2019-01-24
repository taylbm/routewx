var map;
var polylineURI = "/api/polyline";
var NamConusBounds = {'minLat':21.1379, 
                      'minLon':-134.0961, 
                      'maxLat':52.6156,
                      'maxLon':-60.9178
}
var now = new Date();
var modelInit = new Date();
var nowUTCHour = now.getUTCHours();
if (nowUTCHour >= 0 && nowUTCHour < 6) {
  modelInit.setUTCDate(modelInit.getUTCDate() - 1);
}
var modelInitHour = nowUTCHour >= 6 && nowUTCHour <= 18 ? 0 : 12;
modelInit.setUTCHours(modelInitHour);
modelInit.setUTCMinutes(0);
var latestDeparture = new Date(modelInit.getTime() + 59 * 3600 * 1e3);
var polylines = [];
function boundsCheck(loc) {
  var locLat = loc.lat()
  var locLon = loc.lng()
  console.log(locLat, locLon)
  var minLat = locLat > NamConusBounds['minLat']
  var minLon = locLon > NamConusBounds['minLon']
  var maxLat = locLat < NamConusBounds['maxLat']
  var maxLon = locLon < NamConusBounds['maxLon']
  return minLat && minLon && maxLat && maxLon
}
function initMap() {
  var infoWindow = new google.maps.InfoWindow();
  var directionsService = new google.maps.DirectionsService();
  var directionsDisplay = new google.maps.DirectionsRenderer();
  var origin_input = document.createElement('input');
  var destination_input = document.createElement('input');
  var load_div = document.createElement('div');
  var load_border = document.createElement('div');
  var load_text = document.createElement('div');
  var time_picker = document.createElement('input');
  var loaderGIF = document.getElementById('loader-gif-div');
  var legend = document.getElementById('legend');
  var origin_autocomplete = new google.maps.places.Autocomplete(origin_input);
  var destination_autocomplete = new google.maps.places.Autocomplete(destination_input);
  var origin_place_id = null;
  var destination_place_id = null;
  var travel_mode = 'DRIVING';
  function buildHTML() {
    origin_input.className += "controls control-text";
    origin_input.type = "text";
    origin_input.id = "origin-input";
    origin_input.placeholder = "Start";
    destination_input.className += "controls control-text";
    destination_input.type = "text";
    destination_input.id = "destination-input";
    destination_input.placeholder = "End";
    load_div.id = "load-div";
    load_border.className += "controls control-button-border";
    load_border.title = "Click to load directions with highlighted weather hazards";
    load_text.id = "load";
    load_text.className += "control-text";
    load_text.innerHTML = "Load Directions";
    load_border.appendChild(load_text);
    load_div.appendChild(load_border);
    time_picker.className += "controls timePicker";
    time_picker.type = "text";
    time_picker.id = "timePicker";
    time_picker.placeholder = "Please select a departure date/time";
  }
  function expandViewportToFitPlace(map, place) {
   if (place.geometry.viewport) {
     map.fitBounds(place.geometry.viewport);
   } else {
     map.setCenter(place.geometry.location);
     map.setZoom(17);
   }
  }
  function route(origin_place_id, destination_place_id, travel_mode,
	   directionsService, directionsDisplay, selectedDate) {
    if (!origin_place_id || !destination_place_id) {
      return;
    }
    directionsService.route({
      origin: {'placeId': origin_place_id},
      destination: {'placeId': destination_place_id},
      travelMode: travel_mode
    }, function(response, status) {
      if (status === 'OK') {
        directionsDisplay.setDirections(response);
        loaderGIF.style.display = "block";
        var overviewPolyline = response.routes[0].overview_polyline;
        var duration = response.routes[0].legs[0].duration.value;
        var selectedDateUTC = Math.round(selectedDate.getTime() / 1e3);
        var route_info = {
			 'overview_polyline':overviewPolyline, 
			 'duration':duration, 
			 'departure_time': selectedDateUTC
        };
        $.getJSON(polylineURI, route_info, function(data) {
  	  loaderGIF.style.display = "none";
	  directionsDisplay.setMap(null);
	  polylines = [];
	  var clearRoute = true;
	  $.each(data, function(idx, segment) {
	    var hazardLevel = segment['hazard_level']
	    var seg = new google.maps.Polyline({
	    path: segment['coords'],
	    geodesic: true,
	    strokeColor: hazardLevel,
	    strokeOpacity: 0.6,
	    strokeWeight: 4
	    });
	    seg.setMap(map);
	    polylines.push(seg);
	    if ( hazardLevel == 'yellow' || hazardLevel == 'red' ) {
	      clearRoute = false;
	      google.maps.event.addListener(seg, 'mouseover', function(e) {
	        infoWindow.setPosition(e.latLng);
	        d = new Date(0);
	        d.setUTCSeconds(segment['prog_date_epoch'])
	        infoWindow.setContent("Temp: " + segment['temp'] + "\xB0 F, 1 hr. precip: " + segment['precip'] + "in.\n Chance Frozen Precip: "+segment['frozen_precip'] +"%<br>Forecast valid up to 1 hr. from: "+d.toLocaleString());
	        infoWindow.open(map);
	      });
	      google.maps.event.addListener(seg, 'mouseout', function() {
	        infoWindow.close();
	      });
	    }
	  })
	  if (clearRoute)
	    window.alert("Weather along the route is all clear for now, based on your time of departure!")
	  else
	    window.alert("There could be hazardous weather along the route, based on your time of departure!")  
        }).fail(function() {
	  alert("Error loading model data, please try again")
        });
      }  
      else {
        window.alert('Directions request failed due to ' + status);
      }
    });
  }
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 35.1765, lng: -97.2886},
    zoom: 8
  });
  buildHTML();
  directionsDisplay.setMap(map);
  origin_autocomplete.bindTo('bounds', map);
  destination_autocomplete.bindTo('bounds', map);
  flatpickr_config = {
		     enableTime: true,
		     minDate: "today",
		     maxDate: latestDeparture
  }   
  const fp = flatpickr(time_picker, flatpickr_config);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(load_div);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(origin_input);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(destination_input);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(time_picker);
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(legend);
  origin_autocomplete.addListener('place_changed', function() {
    var place = origin_autocomplete.getPlace();
    if (!place.geometry) {
      window.alert("Autocomplete's returned place contains no geometry");
      return;
    }
    bounds = boundsCheck(place.geometry.location)
    if (bounds) {
      // If the place has a geometry, store its place ID and route if we have
      // the other place ID
      origin_place_id = place.place_id;
    }
    else {
      alert("Selected location is outside of NAM 3-km CONUS domain, which covers most of North America. Please select another location.")
    }
  });
  destination_autocomplete.addListener('place_changed', function() {
    var place = destination_autocomplete.getPlace();
    if (!place.geometry) {
      window.alert("Autocomplete's returned place contains no geometry");
      return;
    }
    bounds = boundsCheck(place.geometry.location)
    if (bounds) {
      // If the place has a geometry, store its place ID and route if we have
      // the other place ID
      destination_place_id = place.place_id;
    }
    else {
      alert("Selected location is outside of NAM 3-km CONUS domain, which covers most of North America. Please select another location.")
    }
  });
  load_text.addEventListener("click", function() {
    var selectedDate = fp.latestSelectedDateObj;
    console.log(selectedDate)
    if (typeof(selectedDate) == 'undefined') {
      var selectedDate = new Date();
    }            
    if (polylines.length > 0) {
      $.each(polylines, function(idx, line) {
	line.setMap(null);
      });
    }
    route(origin_place_id, destination_place_id, travel_mode,
	directionsService, directionsDisplay, selectedDate);
  });
  legend = document.getElementById('legend');
  legend.style.display = "block";
}
