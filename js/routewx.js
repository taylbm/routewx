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
  var origin_input = $('#origin-input')[0];
  var destination_input = $('#destination-input')[0];
  var timePicker = $('#time-picker')[0];
  var origin_autocomplete = new google.maps.places.Autocomplete(origin_input);
  var destination_autocomplete = new google.maps.places.Autocomplete(destination_input);
  var origin_place_id = null;
  var destination_place_id = null;
  var origin_name = null;
  var destination_name = null;
  var travel_mode = 'DRIVING';
  var originLoc = null;
  var destinationLoc = null;
  function expandViewportToFitPlace(map, place) {
   if (place.geometry.viewport) {
     map.fitBounds(place.geometry.viewport);
   } else {
     map.setCenter(place.geometry.location);
     map.setZoom(17);
   }
  }
  function route(origin_place_id, destination_place_id, travel_mode,
	   directionsService, directionsDisplay, selectedDate,
           origin_name, destination_name) {
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
        map.fitBounds(directionsDisplay.getDirections().routes[0].bounds);
        $.mobile.loading("show");
        var overviewPolyline = response.routes[0].overview_polyline;
        var duration = response.routes[0].legs[0].duration.value;
        var selectedDateUTC = Math.round(selectedDate.getTime() / 1e3);
        var route_info = {
			 'overview_polyline': overviewPolyline, 
			 'duration': duration, 
			 'departure_time': selectedDateUTC,
                         'start_name': origin_name,
                         'end_name': destination_name
        };
        $.getJSON(polylineURI, route_info, function(data) {
          $.mobile.loading("hide");
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
            clearRoute = hazardLevel == 'green';
	    google.maps.event.addListener(seg, 'mouseover', function(e) {
	      infoWindow.setPosition(e.latLng);
	      d = new Date(0);
	      d.setUTCSeconds(segment['prog_date_epoch'])
              var frozenPrecip = segment['frozen_precip'] < 0 ? 0 : segment['frozen_precip']
	      infoWindow.setContent("Temp: " + segment['temp'] + "\xB0 F, 1 hr. precip: " + 
                                    segment['precip'] + " in.\n Chance Frozen Precip: "+frozenPrecip 
                                    +"%<br>Forecast valid up to 1 hr. from: "+d.toLocaleString());
	      infoWindow.open(map);
	    });
	    google.maps.event.addListener(seg, 'mouseout', function() {
	      infoWindow.close();
	    });
	  })
	  if (clearRoute) {
            $('#travelGuidance').css('background-color','green');
            $('#hazards').html("Weather along the route is all clear for now!");
            $('#moreInfo').html("This information is based on your time of departure of: " + selectedDate.toLocaleString());
            $('#popupResults').popup("open");
	    //window.alert("Weather along the route is all clear for now, based on your time of departure of: " + selectedDate.toLocaleString())
          }
	  else {
            $('#travelGuidance').css('background-color','red');
            $('#hazards').html("There could be hazardous weather along the route!");
            $('#moreInfo').html("This information is based on your time of departure of: " + selectedDate.toLocaleString() + ". Check the map for more details (Map legend located in the route selection menu).");
            $('#popupResults').popup("open");
	    //window.alert("There could be hazardous weather along the route, based on your time of departure: " + selectedDate.toLocaleString() + ". Check the map for more details (Map legend located in the route selection menu).") 
          }
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
  directionsDisplay.setMap(map);
  origin_autocomplete.bindTo('bounds', map);
  destination_autocomplete.bindTo('bounds', map);
  flatpickr_config = {
		     enableTime: true,
		     minDate: "today",
		     maxDate: latestDeparture,
                     defaultDate: now,
                     altFormat: "Y-m-d h:i K",
                     altInput: true,
                     onChange: function(selectedDates, dateStr, instance) {
                       if ((selectedDates[0] - now) < 0) {
                         alert("Please pick a date/time now or in the future!")
                       }
                       else if (selectedDates[0] > latestDeparture) {
                         alert("Latest prognosticable departure time is: " + latestDeparture.toLocaleString())
                       }
                     }
  }   
  const fp = flatpickr(timePicker, flatpickr_config);
  origin_autocomplete.addListener('place_changed', function() {
    var place = origin_autocomplete.getPlace();
    if (!place.geometry) {
      window.alert("Autocomplete's returned place contains no geometry");
      return;
    }
    bounds = boundsCheck(place.geometry.location);
    originLoc = place.geometry.location;
    if (bounds) {
      // If the place has a geometry, store its place ID and route if we have
      // the other place ID
      origin_place_id = place.place_id;
      origin_name = place.name
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
    bounds = boundsCheck(place.geometry.location);
    destinationLoc = place.geometry.location;
    if (bounds) {
      // If the place has a geometry, store its place ID and route if we have
      // the other place ID
      destination_place_id = place.place_id;
      destination_name = place.name;
    }
    else {
      alert("Selected location is outside of NAM 3-km CONUS domain, which covers most of North America. Please select another location.")
    }
  });
  $('#loadDirections').click(function(){
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
	directionsService, directionsDisplay, selectedDate,
        origin_name, destination_name);
  });
  $('#feedbackForm').on("submit", function(e) {
    e.preventDefault();
    var data = $(this).serializeArray();
    $.post('/api/feedback', data, function() {
      $('#popupFeedback').popup("close");
    });
  });
  legend = document.getElementById('legend');
  legend.style.display = "block";
  setTimeout(function () {
    $('#popupDisclaimer').popup('open');
  }, 1000);
  $('#acceptTerms').on("click", function() {
    $('#popupDisclaimer').popup('close');
  });
}
