/*
 * Matt Diener
 *
 * This applictation is inspired by the paper:
 * An arc orienteering algorithm to find the most scenic path on a large-scale
 * road network
 * Ying Lu, Cyrus Shahabi
 * http://infolab.usc.edu/DocsDemos/lu_ScenicPath_GIS15.pdf
 *
 * Some of this code is taken from the Google Maps API documentation and the
 * Flickr API documentation
 * https://developers.google.com/maps/documentation/javascript/
 * https://www.flickr.com/services/api/flickr.photos.search.html
 *
 * Additional sources include:
 * http://stackoverflow.com/questions/27928
 * http://www.cleveralgorithms.com/nature-inspired/stochastic/grasp.html
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
 *
 * Algorithms used for generating paths:
 * - Brute Force
 * - GRASP Variation (Greedy Randomized Adaptive Search Procedure)
 *
 * -----------------------------------------------------------------------------
 * This application allows users to find a scenic location to travel to
 * within a specified time limit. A location is said to be scenic if there
 * are a lot of photos that have been taken nearby. After finding a scenic
 * location, this application tries to find the most scenic path to that
 * location that satisfies the same time constraint.
 *
 * The example of a picnic outing is used:
 * The user wants to go on a picnic somewhere nice and also wants the trip there
 * to be enjoyable. The priority is given to the destination, but a scenic path
 * is preferred.
 *------------------------------------------------------------------------------
 */

var map;
var geocoder;
var directionsService;
var directionsDisplay;
var marker;
var photoMarkers = [];
var clusterMarkers = [];
var flickrKey;

var pos = {
  lat: 45.387,
  lng: -75.696
};

/*
General initialization for the client
*/
function initialize(){
  initAPIKeys();
  initMap();
}

/*
Gets the API key from the server
*/
function initAPIKeys() {
  $.ajax({
    'url':'/flickrKey',
    'dataType':'text'
  }).done(function(data){
    flickrKey = data;
  });
};

/*
Basic Inititalization code for the map and the sliding search form
*/
function initMap() {
  /*
   * Get the map set up
   */
  map = new google.maps.Map($('#map')[0], {
    center: {lat: 45.387, lng: -75.696},
    zoom: 15
  });

  geocoder = new google.maps.Geocoder();

  marker = new google.maps.Marker({
      map: map,
      position: pos
  });

  /*
   * Geolocation stuff
   */
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      pos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      map.setCenter(pos);
      marker.setPosition(pos);
      updateAddressField();
    }, function() {
      handleLocationError(true, infoWindow, map.getCenter());
      updateAddressField();
    });
  } else {
    var infoWindow = new google.maps.InfoWindow({map: map});
    handleLocationError(false, infoWindow, map.getCenter());
  }

  /*
    Directions API
  */
  directionsService = new google.maps.DirectionsService();
  directionsDisplay = new google.maps.DirectionsRenderer();
  directionsDisplay.setMap(map);

  /*
   * Set up the search GUI
   */
  $('#side-pane #collapse-button').on('click touchstart',function(){
    if ($('#side-pane').hasClass('collapsed')){
      $('#side-pane').removeClass('collapsed');
    }else{
      $('#side-pane').addClass('collapsed');
    }
  });
  $('#map').on('click touchstart',function(){
    $('#side-pane').addClass('collapsed');
  });

  $('#travel-time').val('00:25');

  $('#search-button').on('click touchstart',function(){
    geocoder.geocode({
      'address':$('#start-address').val()
    },function(results,status){
      if (status == google.maps.GeocoderStatus.OK) {
        pos = results[0].geometry.location;
        map.setCenter(pos);
        marker.setPosition(pos);

        $('#side-pane').addClass('collapsed');
        run();
      }else{
        alert('Could not process inputted address. Try again.');
      }
    });
  });
}

/*
Makes API calls and runs the variations of the algorithm
*/
function run(){
  //adjust the time to minutes
  clusterMarkers = [];
  photoMarkers = [];

  var time = parseInt("0"+$('#travel-time-hours').val()) * 60 +
             parseInt("0"+$('#travel-time-minutes').val());

  var isCar = $('#travel-mode').val() === 'car';

  //Estimated 4km/h walking speed
  //Estimated 50km/h car speed
  var radius = isCar?time*50/60:time*4/60;
  if (radius > 32) radius = 32; //API cap

  //do a search for photos in the area
  $.ajax({
    'url':'https://api.flickr.com/services/rest/?' +
    'api_key=' + flickrKey +
    '&method=flickr.photos.search' +
    '&has_geo=true' +
    '&lat=' + pos.lat() +
    '&lon=' + pos.lng() +
    '&radius=' + radius +
    '&extras=geo'
  }).done(function(data){
    var i;

    var tmpPhotos = [];

    $.each(data.childNodes[0].childNodes[1].children, function(index,photo){
      var photoPos = {
        'lat':parseFloat(photo.attributes.latitude.value),
        'lng':parseFloat(photo.attributes.longitude.value)
      };
      tmpPhotos.push(photoPos);
    });

    //crappy n^3 algorithm
    while(tmpPhotos.length > 0){
      var photoClusters = [];

      for (i = 0; i < tmpPhotos.length; i++){
        for (var j = 0; j < tmpPhotos.length; j++){
          //500m proximity test (this is pretty arbitrary, but it seems to work
          //pretty well.. the number is based on the fact that a location is
          //often within a 1km diameter)
          if(getDistanceFromLatLonInKm(tmpPhotos[i].lat,
                                       tmpPhotos[i].lng,
                                       tmpPhotos[j].lat,
                                       tmpPhotos[j].lng) < 0.5){
            if(photoClusters[i]){
              photoClusters[i].push(tmpPhotos[j]);
            }else{
              photoClusters[i] = [tmpPhotos[j]];
            }
          }
        }
      }

      var maxCluster = 0;
      var clusterIndex = 0;
      for (i = 0; i < photoClusters.length; i++){
        if (photoClusters[i].length > maxCluster){
          maxCluster = photoClusters[i].length;
          clusterIndex = i;
        }
      }

      clusterMarkers.push({
        'lat':tmpPhotos[clusterIndex].lat,
        'lng':tmpPhotos[clusterIndex].lng,
        'value':maxCluster
      });

      for (i = 0; i < maxCluster; i++){
        tmpPhotos.splice(tmpPhotos.indexOf(photoClusters[clusterIndex][i]),1);
      }
    }

    //Now, isolate the top 9 locations. Unfortunately, due to the constraints of
    //the google maps distance matrix api, this is the largest data-set we can
    //use (9+1)^2 = 100... we are limited to 100 measurements every 10 seconds
    //and this algorithm certainly should not run for more than 10 seconds
    clusterMarkers.sort(function(a,b){
      return b.value - a.value;
    });

    var topNine = clusterMarkers.slice(0,9);

    var showingScores = $('#checkbox-show-ratings')[0].checked;

    if (showingScores){
      $.each(topNine, function(index, point){
        var tmpMarker = new google.maps.Marker({
            map: map,
            position: {'lat':point.lat,'lng':point.lng},
            label: (point.value<10)?
                '' + point.value : String.fromCharCode(point.value+64-9)
        });
      });
    }

    var points = [{'lat':pos.lat(),'lng':pos.lng()}].concat(topNine);
    var pointStrings = [];
    for (i = 0; i < points.length; i++){
      pointStrings.push(points[i].lat + ',' + points[i].lng);
    }
    //use the distance matrix api to get the distance matrix
    var isCar = $('#travel-mode').val() === 'car';

    $.ajax({
      'url':'/distancematrix?'+
            'origins=' + pointStrings.join('|') +
            '&destinations=' + pointStrings.join('|') +
            '&mode=' + (isCar?'driving':'walking'),
      'dataType':'json'
    }).done(function(data){
        var matrix = [];

        $.each(data.rows, function(rowIndex,row){
          matrix[rowIndex] = [];
          $.each(row.elements, function(columnIndex,col){
            matrix[rowIndex][columnIndex] = col.duration.value/60;
          });
        });

        var bfResult = bruteForce(points, matrix, time);
        var graspResult = GRASP(points,matrix, time);

        console.log(bfResult);
        console.log(graspResult);

        showDirections(points,bfResult.path);
    });
  });
}

/*
Based on artile here:
http://www.cleveralgorithms.com/nature-inspired/stochastic/grasp.html
*/
function GRASP(points, matrix, time){
  //100 is relatively fast, so we can get away with it. In a practical
  //application, this would probably require more thought. Unfortunately, GRASP
  //with 100 iterations may be approaching or exceeding the runtime of some of
  //the lucky brute forces with 10 points...of course, with more than 10 points,
  //there is a low likelyhood that the brute force algorithm will actually be
  //fast enough to complete
  //
  //Note: this algorithm is fairly configurable. Between maxIterations and the
  //size of the candidate sets for the greedy construction, there are many
  //combinations of configurations which should be experimented with.
  var maxIterations = 100;
  var numCandidates = 20;
  var localSearchSize = 20;

  var best = {'path':[],'score':0,'dist':0};

  var pathCost = function(path){
    var last = 0;
    var sum = 0;
    for (var j = 0; j < path.length; j++){
      sum += matrix[last][path[j]];
      last = path[j];
    }
    return sum;
  };

  var pathScore = function(path){
    var score = 0;
    for (var j = 0; j < path.length; j++){
      score += points[path[j]].value;
    }
    return score;
  };

  var constructGreedySolution = function(candidate){
    //Simply select a random end point and insert greedy points in between the
    //beginning and end until distance is exceeded.
    var validPoints = [];
    for (var i = 1; i < points.length; i++){
      validPoints.push(i);
    }

    //pick a random end point
    var path = [getRandomIntInclusive(1,points.length-1)];

    while (validPoints.length > 0 && pathCost(path) < time){
      validPoints.splice(validPoints.indexOf(path[0]), 1);
      candidate.path = path;
      candidate.score = pathScore(path);
      candidate.dist = pathCost(path);

      //now insert the best point that we can find
      //the improvement is equal to scoreImprovement/distanceImprovement
      //(Ideally we are maximizing this globally)
      var bestPath = path.slice();
      var bestScore = 0;
      var bestDist = 0;

      var tempValidPoints = validPoints.slice();

      //use a max of 20 for construction (another arbitrary number that would
      //need to be played with in practice)
      for (var j = 0; j < Math.min(validPoints.length,numCandidates); j++){
        var index = getRandomIntInclusive(0,tempValidPoints.length-1);
        var tempPath = [tempValidPoints[index]].concat(path);
        var tempDist = pathCost(tempPath);
        var tempScore = pathScore(tempPath);
        tempValidPoints.splice(index,1);

        if (tempDist < time){
          if (tempScore > bestScore){
            bestPath = tempPath;
            bestScore = tempScore;
            bestDist = tempDist;
          }else if (tempScore === bestScore && tempDist < bestDist){
            bestPath = tempPath;
            bestScore = tempScore;
            bestDist = tempDist;
          }
        }
      }
      path = bestPath;
    }

    return candidate;
  };

  var localSearch = function(candidate){
    //Our local search will simply try to swap points in the candidate to see if
    //it makes an improvement

    //A neighbour of the candidate is the same path as the candidate but with a
    //single swap with a point that is not visited in the candidate solution.
    var validPoints = [];
    var i;

    for (i = 1; i < points.length; i++){
      if (candidate.path.indexOf(i) === -1){
        validPoints.push(i);
      }
    }

    for (i = 0; i < localSearchSize; i++){
      //swap two random points
      var randomIndex = getRandomIntInclusive(0,candidate.path.length-1);
      var randomPointIndex = getRandomIntInclusive(0,validPoints.length-1);
      var temp = candidate.path[randomIndex];
      candidate.path[randomIndex] = validPoints[randomPointIndex];
      validPoints[randomPointIndex] = temp;

      //if this is legal and an improvement
      var tempScore = pathScore(candidate.path);
      var tempDist = pathCost(candidate.path);

      if (tempDist < time && (tempScore > candidate.score || (tempScore === candidate.score && tempDist < candidate.dist) )){
        //keep the swap
        candidate.score = tempScore;
        candidate.dist = tempDist;
      }else{
        //swap back
        temp = candidate.path[randomIndex];
        candidate.path[randomIndex] = validPoints[randomPointIndex];
        validPoints[randomPointIndex] = temp;
      }
    }
  };

  //Main GRASP algorithm
  for (var i = 0; i < maxIterations; i++){
    var candidate = {'path':[],'score':0,'dist':0};
    constructGreedySolution(candidate);
    if (candidate.path.length > 0){
      localSearch(candidate);
    }
    if (best.score < candidate.score){
      best = candidate;
    }else if(best.score === candidate.score && candidate.dist < best.dist){
      best = candidate;
    }
  }

  return best;
}

/*
Simple brute force algorithm, checks every viable path and returns the best one
*/
function bruteForce(points,matrix, time){
  var calls = 0;
  var bestScore = 0;
  var bestDist = 0;
  var bestPath = [];

  var usedPoints = [];
  var i;
  for (i = 0; i < points.length; i++){
    usedPoints[i] = false;
  }
  usedPoints[0] = true;

  var distSum = 0;
  var scoreSum = 0;
  var currentPath = [];

  var bruteForceHelper = function(last){
    calls++;
    var j;

    if (distSum > time){
      return;
    }

    if (scoreSum > bestScore){
      bestPath = currentPath.slice();
      bestScore = scoreSum;
      bestDist = distSum;
    }else if(scoreSum === bestScore && distSum < bestDist){
      bestPath = currentPath.slice();
      bestScore = scoreSum;
      bestDist = distSum;
    }

    for (j = 1; j < points.length; j++){
      if (!usedPoints[j]){
        usedPoints[j] = true;
        distSum += matrix[last][j];
        scoreSum += points[j].value;
        currentPath.push(j);

        bruteForceHelper(j);

        currentPath = currentPath.slice(0,-1);
        distSum -= matrix[last][j];
        scoreSum -= points[j].value;
        usedPoints[j] = false;
      }
    }
  };

  bruteForceHelper(0);
  return {'path':bestPath,'dist':bestDist,'score':bestScore};
}

/*
Shows the directions along the path from point 0 to each point on the path,
uses code from Google Maps API documentation
*/
function showDirections(points, path){
  var isCar = $('#travel-mode').val() === 'car';
  var waypoints = [];
  for (var i = 0; i < path.length-1; i++){
    waypoints.push({'location':points[path[i]].lat+','+points[path[i]].lng});
  }

  directionsService.route({
    origin: points[0].lat+','+points[0].lng,
    destination: points[path[path.length-1]].lat +
                 ',' + points[path[path.length-1]].lng,
    waypoints: waypoints,
    optimizeWaypoints: false,
    travelMode: isCar?
        google.maps.TravelMode.DRIVING : google.maps.TravelMode.WALKING
  }, function(response, status) {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsDisplay.setDirections(response);
      var route = response.routes[0];
    } else {
      window.alert('Directions request failed due to ' + status);
    }
  });
}

/*
Updates the address field in the search form using the geolocation of the
user
*/
function updateAddressField(){
  geocoder.geocode({
    'latLng': pos
  }, function (results, status) {
    if (status === google.maps.GeocoderStatus.OK) {
      if (results[1]) {
        $('#start-address').val(results[1].formatted_address);
      }
    }
  });
}

/*
Handles geolocation errors thrown by google maps api.
Taken from documentation.
*/
function handleLocationError(browserHasGeolocation, infoWindow, pos) {
  infoWindow.setPosition(pos);
  infoWindow.setContent(browserHasGeolocation ?
                        'Error: The Geolocation service failed.' :
                        'Error: Your browser doesn\'t support geolocation.');
}


/*
Code taken from:
http://stackoverflow.com/questions/27928
*/
function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

/*
From mozilla docs
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
*/
function getRandomIntInclusive(min, max) {
  if (min===max)return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
