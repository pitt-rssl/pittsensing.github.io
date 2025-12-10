// Map (Leaflet)
let map;

// Markers for map
let markers = {};
var markerGroup;

// Default sensor colors
const sckDefColor = "#FFFF00";
const alleghenyDefColor = "#FFA500";
const purpleairDefColor = "#800080";

// Color ranges for tracking options
var humidityRainbow;
var temperatureRainbow;
var pm25Rainbow;
var selectRainbow;

// Compare
var compare = false;

// Current marker
var curr_marker;

// Map data
var dataSCK = [];
var dataPA = [];
var dataAL = [];

// Filter selected by user
var filter = 0;
var filters = {0: ["pm25", "PM2.5"], 1: ["temp", "Temperature"], 2: ["pm25", "PM2.5"], 3: ["hum", "Humidity"]};
var chart_fill_colors = {"pm25": "rgba(170, 232, 90, 0.3)", "temp": "rgba(232, 90, 92, 0.3)", "hum": "rgba(90, 149, 232, 0.3)"};
var chart_border_colors = {"pm25": "rgba(169, 201, 125)", "temp": "rgba(232, 90, 92)", "hum": "rgba(104, 127, 237)"};

// Selector value
var selector = 0;

// Number of markers in user select compare box
var queued = 0;

// Variable to be mutated when user compares specific
// selected sensors
var selectedResults = {
    // highest PM 25 and sensor respective name
    highestPM25: 0,
    highestPM25Name: "",

    // highest humidity and sensor respective name
    highestHUM: 0,
    highestHUMName: "",

    // highest temperature and sensor respective name
    highestTEMP: 0,
    highestTEMPName: "",

    // averages for each filter field
    avgPM25: 0,
    avgHUM: 0,
    avgTEMP: 0,

    //used to divide for averages
    sensorsWithHUM: 0,
    sensorsWithTEMP: 0,
};

// variable to be mutated when user compares specific
// company sensors
var companyResults = {
    // global pm25 data
    highestPM25_SCK: 0,
    highestPM25Name_SCK: "",
    highestPM25_PA: 0,
    highestPM25Name_PA: "",
    highestPM25_AL: 0,
    highestPM25Name_AL: "",

    // global humidity data
    highestHUM_SCK: 0,
    highestHUMName_SCK: "",
    highestHUM_PA: 0,
    highestHUMName_PA: "",

    // global temperature data
    highestTEMP_SCK: 0,
    highestTEMPName_SCK: "",

    // averages for all 3 sensors
    avgPM25_AL: 0,

    avgPM25_PA: 0,
    avgHUM_PA: 0,

    avgHUM_SCK: 0,
    avgTEMP_SCK: 0,
    avgPM25_SCK: 0,

    //used to divide for averages
    // (number of sensors in the list of this type)
    sckNum: 0,
    alleghenyNum: 0,
    purpleairNum: 0
};

// Chart
var chart;
var init_time_interval = "hour";

// Execute when the DOM is fully loaded
$(document).ready(function() {
    // Configure application
    configure();
    generateRainbows();

    // Configure map
    var center =  [40.4406, -79.9959] // Pittsburgh, PA
    map = L.map("map-canvas").setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markerGroup = L.layerGroup().addTo(map);
    
    // Runs when dropdown is changed
    $("#timeframe").change(function () {
        var timeframe = $(this).children("option:selected").val();
        var time_split = timeframe.split("_");
        var amount = time_split[0];
        var interval = time_split[1];

        timeframe = {"date": interval, "amount": amount};

        // Send select timeframe to server
        $.ajax({
            url: '/timeframe',
            type: 'POST',
            data: JSON.stringify({"timeframe": timeframe, "marker": curr_marker}),
            contentType: "application/json",
            dataType: 'json',
            success: function(data) {
                // Display data on chart
                sensor_data = [];
                dates = [];
                curr_filter = filters[filter][0];
                for (let i = 0; i < data.length; i++) {
                    var date = toBrowserTimezone(data[i]["time_cast"]);
                    var sensor = data[i][curr_filter];
                    dates.push(date);
                    sensor_data.push(sensor);
                }

                // Create chart
                create_chart(curr_marker, sensor_data, interval, dates);
            }
        });
    });

    // Event listeners
    $('.close').on('click', function() {
        // Fade out chart
        $('.chart-container').fadeOut();

        // Destroy chart
        if (chart) {
            chart.destroy();
        }
    });

    // Set compare to true
    $('.compare').on('click', function() {
        compare = true;
    });

    // Query Allengheny County sensor locations
    $.ajax({
        url: '/allegheny_sensors',
        dataType: 'json',
        success: function(data) {
           dataAL = data;
           placeAL(filter);
        }
    });

    // Query PurpleAir sensor locations
    $.ajax({
        url: '/purpleair_sensors',
        dataType: 'json',
        success: function(data) {
          dataPA = data;
          placePA(filter);
        }
    });

    // Query SmartCitizenKit sensor locations
    $.ajax({
        url: '/sck_sensors',
        dataType: 'json',
        success: function(data) {
          dataSCK = data;
          placeSCK(filter);
        }
    });
});

// Search database for typeahead's suggestions
function search(query, syncResults, asyncResults) {
    // Get places matching query (asynchronously)
    let parameters = {
        q: query
    };
    $.getJSON("/search", parameters, function(data, textStatus, jqXHR) {
        // Call typeahead's callback with search results (i.e., places)
        asyncResults(data);
    });
}

// Add marker for place to map
function addMarker(place, filter, selector) {
    // Get coordinates for marker
    let myLatLng = [place.latitude, place.longitude];

    // Intervals to help construct curr_marker
    var intervals = {
      sck: "10 Minutes",
      purpleair: "10 Minutes",
      alleghenycounty: "1 Hour"
    };

    if (selector == null) { selector = 0; }

    // curr_marker for sck info
    if (place.type == "sck") {
      curr_marker = {"type": place.type, "id": place.id, "name": place.name, "interval": intervals[place.type]};
    }
    // Handles curr_marker for both purpleair and allegheny county
    else {
      curr_marker = {"type": place.type, "id": place.name, "name": place.name, "interval": intervals[place.type]};
    }

    // Set initial timeframe
    timeframe = {"date": "day", "amount": 1}

    // Value to hold respective sesor filter information for user
    var curr_value = 0;

    // Default marker color
    var markerColor = "#000000";

    // Array to help find hex color value
    var copyArr = null;

    // Query information to determine gradient for markers
    $.ajax({
        url: '/timeframe',
        type: 'POST',
        data: JSON.stringify({"timeframe": timeframe, "marker": curr_marker}),
        contentType: "application/json",
        dataType: 'json',
        success: function(data) {
          if (data.length > 0) {
            ////////////////////////
            // Allegheny Sensors ///
            ////////////////////////
            if (place.type == "alleghenycounty")  {
              let length = data.length - 1;
              if( data[length-1]["pm25"] > companyResults.highestPM25_AL) {
                // update the global results variable before the compare button is clicked
                companyResults.highestPM25Name_AL = place.id;
                companyResults.highestPM25_AL = data[length-1]["pm25"];
              }
              // add to average to eventually be calculated by the compare button
              companyResults.avgPM25_AL = parseInt(companyResults.avgPM25_AL) + parseInt(data[length-1]["pm25"]);
              companyResults.alleghenyNum = companyResults.alleghenyNum + 1;

              /// PM2.5 filter
              if (filter == 2) { curr_value = (data[length]["pm25"]); }
          }

          ////////////////////////
          // Purple Air Sensors //
          ////////////////////////
          else if (place.type == "purpleair") {
              /// pm25 filter
              if (data[0]["pm25"] > companyResults.highestPM25_PA) {

                // update global results variable fields for PM25
                companyResults.highestPM25Name_PA = place.name;
                companyResults.highestPM25_PA = data[0]["pm25"];
              }
              // add to average to eventually be calculated by the compare button
              companyResults.avgPM25_PA = parseInt(companyResults.avgPM25_PA) + parseInt(data[0]["pm25"]);

              if (filter == 2) { curr_value = (data[0]["pm25"]); }

              // himidity filter
              if (data[0]["hum"] > companyResults.highestHUM_PA) {

                // update global results variable fields for PM25
                companyResults.highestHUMName_PA = place.name;
                companyResults.highestHUM_PA = data[0]["hum"];
              }
              // add to average to eventually be calculated by the compare button
              companyResults.avgHUM_PA = parseInt(companyResults.avgHUM_PA) + parseInt(data[0]["hum"]);
              // update number to divide value by
              companyResults.purpleairNum = companyResults.purpleairNum + 1;

              if(filter == 3) {  curr_value = (data[0]["hum"]); }
          }

          //////////////////
          // SCK Sensors //
          /////////////////
          else {
            /// temperature filter
            if ((data[0]["temp"]) > companyResults.highestTEMP_SCK) {
              // update global results variable fields for PM25
              companyResults.highestTEMPName_SCK = place.name;
              companyResults.highestTEMP_SCK = data[0]["temp"];
            }

            // add to average to eventually be calculated by the compare button
            companyResults.avgTEMP_SCK = parseInt(companyResults.avgTEMP_SCK) + parseInt(data[0]["temp"]);
            if(filter == 1) {  curr_value = (data[0]["temp"]);  }

            /// pm25 filter
            if (parseInt(data[0]["pm25"]) > parseInt(companyResults.highestPM25_SCK)) {
              // update global results variable fields for PM25
              companyResults.highestPM25Name_SCK = place.name;
              companyResults.highestPM25_SCK = data[0]["pm25"];
            }
            // add to average to eventually be calculated by the compare button
            companyResults.avgPM25_SCK = parseInt(companyResults.avgPM25_SCK) + parseInt(data[0]["pm25"]);
            if (filter == 2) {  curr_value = (data[0]["pm25"]);  }

            /// humidity filter
            if (data[0]["hum"] > companyResults.highestHUM_SCK) {

              // update global results variable fields for PM25
              companyResults.highestHUMName_SCK = place.name;
              companyResults.highestHUM_SCK = data[0]["hum"];
            }
            // add to average to eventually be calculated by the compare button
            companyResults.avgHUM_SCK = parseInt(companyResults.avgHUM_SCK) + parseInt(data[0]["hum"]);
            companyResults.sckNum = companyResults.sckNum + 1;
            if( filter == 3) { curr_value = (data[0]["hum"]); }
            } 
          }

          // find color gradient appropriate to users filter
          // and set a copyrainbow to that rainbow          
          if (selector == 1) {  copyArr = selectRainbow; }
          else if ( filter == 1) { copyArr = temperatureRainbow; }
          else if (filter == 2) { copyArr = pm25Rainbow; }
          else if (filter == 3 ) { copyArr = humidityRainbow; }
          else { copyArr = null; }

          // place markers correlating to user filter selection
          if ((filter != 0 || selector != 0) && copyArr!= null ) {
              var markerColor = "#" + copyArr.colorAt(curr_value);

              var markerStyle = `
              background-color: ${markerColor};
              width: 1.7rem;
              height: 1.7rem;
              display: block;
              left: -0.5rem;
              top: -0.5rem;
              position: relative;
              border-radius: 3rem 3rem 0;
              transform: rotate(45deg);
              border: 2px solid #FFFFFF`

              // create marker variables to be added to map
              var marker_icon = L.divIcon({
                className: place.name,
                html: `<span style="${markerStyle}" />`
              })
          }
          // if there was no filter, place all default markers
          else  {
              if ( place.type == "alleghenycounty") {
                var markerStyle = `
                background-color: ${alleghenyDefColor};
                width: 1.7rem;
                height: 1.7rem;
                display: block;
                left: -0.5rem;
                top: -0.5rem;
                position: relative;
                border-radius: 3rem 3rem 0;
                transform: rotate(45deg);
                border: 2px solid #967600`

                var marker_icon = L.divIcon({
                  className: place.name,
                  html: `<span style="${markerStyle}" />`
                })
              }
              else if (place.type == "purpleair") {
                var markerStyle = `
                background-color: ${purpleairDefColor};
                width: 1.7rem;
                height: 1.7rem;
                display: block;
                left: -0.5rem;
                top: -0.5rem;
                position: relative;
                border-radius: 3rem 3rem 0;
                transform: rotate(45deg);
                border: 2px solid #FFFFFF`

                var marker_icon = L.divIcon({
                  className: place.name,
                  html: `<span style="${markerStyle}" />`
                })
              }
              else {
                var markerStyle =
                `background-color: ${sckDefColor};
                width: 1.7rem;
                height: 1.7rem;
                display: block;
                left: -0.5rem;
                top: -0.5rem;
                position: relative;
                border-radius: 3rem 3rem 0;
                transform: rotate(45deg);
                border: 2px solid #98a322`

              var marker_icon = L.divIcon({
                className: place.name,
                html: `<span style="${markerStyle}" />`
              })
        }
      }
        // add marker to marker group to be added to map
        var marker = L.marker(myLatLng, {icon: marker_icon});
        markerGroup.addLayer(marker);

        // listener for non-compare functions
        // i.e. chart creation
        if(selector == 0) {
          marker.on("click", function() {
              // Query readings

                  var intervals = {
                    sck: "10 Minutes",
                    purpleair: "10 Minutes",
                    alleghenycounty: "1 Hour"
                  };
                  // Set current marker
                  if (place.type == "sck") {
                      curr_marker = {"type": place.type, "id": place.id, "name": place.name, "interval": intervals[place.type]};
                  }
                  else {
                    curr_marker = {"type": place.type, "id": place.name, "name": place.name, "interval": intervals[place.type]};
                  }

                  // Set initial timeframe
                  timeframe = {"date": "day", "amount": 1}

                  // Title 
                  if (place.type == "alleghenycounty")  {
                    title = "<p class='text-center'><b>" + place.name+ "</b></p>";
                    title += "<div class='text-center'>" + todaysDate() + "</div>";
                  }

                  // Query data for each sensor location 
                  $.ajax({
                      url: '/timeframe',
                      type: 'POST',
                      data: JSON.stringify({"timeframe": timeframe, "marker": curr_marker}),
                      contentType: "application/json",
                      dataType: 'json',
                      success: function(data) {

                        // content for allegheny sensors
                        if(place.type == "alleghenycounty")  {
                          var content_size = Math.min(3, data.length);
                          let length = data.length - 1;

                          ul = "<ul class='list-group list-group-horizontal'>";
                          for (let i = 0; i < content_size; i++) {
                              var pm = "<b>" + data[length - i - 1]["pm25"] + "</b>";
                              var date = data[length - i - 1]["time_cast"];
                              date = date.substring(0, date.length - 3);

                              item = "<li class='list-group-item no-vertical-border flex-fill text-center pm-readings'>" + date + "<br/>" + pm + "</li>";
                              ul += item;
                          }
                          // End list 
                          ul += "</ul>";
                          // Complete info
                          myInfo = title + ul;
                        }
                        // content for purpleair sensors
                        else if (place.type == "purpleair") {
                          var content_size = 1;
                          var myInfo = "<div class='text-center'><b>Purple Air</b></div>"

                          myInfo += "<hr class='divider'/>"
                          myInfo += "<div><b>Name: </b>" + place.name + "</div>";
                          for (let i = 0; i < content_size; i++) {
                              myInfo += "<div><b>PM2.5: </b>" + data[i]["pm25"] + "</div>";
                              myInfo += "<div><b>Humidity: </b>" + data[i]["hum"] + "</div>";
                              myInfo += "<div><b>Date: </b>" + data[i]["time_cast"] + "</div>";
                            }
                        }
                        // content for sck sensors
                        else {
                          var content_size = 1;
                          var myInfo = "<div class='text-center'><b>SmartCitizenKit</b></div>"
                          myInfo += "<hr class='divider'/>"
                          myInfo += "<div><b>Name: </b>" + place.name + "</div>";
                          myInfo += "<div><b>Owner: </b>" + place.owner + "</div>";

                          for (let i = 0; i < content_size; i++) {
                              myInfo += "<div><b>PM2.5: </b>" + data[i]["pm25"] + "</div>";
                              myInfo += "<div><b>Humidity: </b>" + data[i]["hum"] + "</div>";
                              myInfo += "<div><b>Temperature: </b>" + data[i]["temp"] + "</div>";
                              myInfo += "<div><b>Date: </b>" + toBrowserTimezone(data[i]["time_cast"]) + "</div>";
                            }
                        }

                      // Create info window 
                      marker.bindPopup(myInfo).openPopup();
                      sensor_data = [];
                      dates = [];
                      for (let i = 0; i < data.length; i++) {
                          var date = data[i]["time_cast"];
                          if (place.type == "sck") date = toBrowserTimezone(date);
                          var sensor = data[i][filters[filter][0]];
                          dates.push(date);
                          sensor_data.push(sensor);
                      }

                      if (place.type == "sck") {
                        if (compare) {
                            var data = [];
                            for (let i = 0; i < sensor_data.length; i++) {
                                data.push({x: dates[i], y: sensor_data[i]});
                            }
                            var series = {
                                label: place.name,
                                data: data,
                                fill: false,
                                pointRadius: 1,
                                pointHoverRadius: 5,
                                pointHoverBackgroundColor: 'rgb(52, 113, 235)',
                                backgroundColor: 'rgb(52, 113, 235)',
                                borderColor: 'rgb(52, 113, 235)',
                            };
                            chart.data.datasets.push(series);
                            chart.update();

                            compare = false;
                        } else {
                            // Create chart
                            create_chart(curr_marker, sensor_data, init_time_interval, dates);
                        }
                      }
                      else {
                        // Create chart
                        create_chart(curr_marker, sensor_data, init_time_interval, dates);
                      }
                    }
                });
           });
        }

        // listener for comparing user-selected sensors
        if(selector == 1) {
            marker.on("click", function() {
            var intervals = {
              sck: "10 Minutes",
              purpleair: "10 Minutes",
              alleghenycounty: "1 Hour"
            };
            // Set current marker
            if(place.type == "sck") {
                curr_marker = {"type": place.type, "id": place.id, "name": place.name, "interval": intervals[place.type]};
            }
            else {
              curr_marker = {"type": place.type, "id": place.name, "name": place.name, "interval": intervals[place.type]};
            }
            // Set initial timeframe
            timeframe = {"date": "day", "amount": 1}
            // Title //
            if(place.type == "alleghenycounty")  {
               title = "<p class='text-center'><b>" + place.name+ "</b></p>";
              title += "<div class='text-center'>" + todaysDate() + "</div>";
            }
            // Query data for each sensor location
            $.ajax({
                url: '/timeframe',
                type: 'POST',
                data: JSON.stringify({"timeframe": timeframe, "marker": curr_marker}),
                contentType: "application/json",
                dataType: 'json',
                success: function(data) {

                  // content for allegheny sensors
                  if(place.type == "alleghenycounty")  {
                    if(queued < 3) {
                      var content_size = Math.min(3, data.length);
                      let length = data.length - 1;

                      var myInfo = "<div class='text-center'><b>Allegheny County</b></div>"
                      myInfo += "<hr class='divider'/>"
                      myInfo += "<div><b>Name: </b>" + place.id + "</div>";
                      myInfo += "<div><b>PM2.5: </b>" +  data[length - 1]["pm25"] + "</div>";

                      if(data[length-1]["pm25"] > selectedResults.highestPM25) {
                        // update the global results variable before the compare button is clicked
                        selectedResults.highestPM25Name = place.id;
                        selectedResults.highestPM25 = data[length-1]["pm25"];
                      }
                      // add to average to eventually be calculated by the compare button
                      selectedResults.avgPM25 = parseInt(selectedResults.avgPM25) + parseInt(data[length- 1]["pm25"]);
                      myInfo += "<div><b>Date: </b>" + data[length- 1]["time_cast"] + "</div>";

                      document.getElementById("info").innerHTML += "<br>" + myInfo;
                      queued++;
                      //console.log("added to list, list size now : " + queued);
                    }
                  }
                  // content for purpleair sensors
                  else if (place.type == "purpleair") {
                    if(queued < 3) {
                    var content_size = 1;
                    var myInfo = "<div class='text-center'><b>Purple Air</b></div>"
                    myInfo += "<hr class='divider'/>"
                    myInfo += "<div><b>Name: </b>" + place.name + "</div>";

                    for (let i = 0; i < content_size; i++) {
                        myInfo += "<div><b>PM2.5: </b>" + data[i]["pm25"] + "</div>";
                        // update the global results variable before the compare button is clicked
                        if(data[i]["pm25"] > selectedResults.highestPM25) {
                          // update global results variable fields for PM25
                          selectedResults.highestPM25Name = place.name;
                          selectedResults.highestPM25 = data[i]["pm25"];
                        }
                        // add to average to eventually be calculated by the compare button
                        selectedResults.avgPM25 = parseInt(selectedResults.avgPM25) + parseInt(data[i]["pm25"]);
                        myInfo += "<div><b>Humidity: </b>" + data[i]["hum"] + "</div>";
                        // update the global results variable before the compare button is clicked
                        if(data[i]["hum"] > selectedResults.highestHUM) {
                          // update global results variable fields for PM25
                          selectedResults.highestHUMName = place.name;
                          selectedResults.highestHUM = data[i]["hum"];
                        }
                        // add to average to eventually be calculated by the compare button
                        selectedResults.avgHUM = parseInt(selectedResults.avgHUM) + parseInt(data[i]["hum"]);
                        // update number to divide value by
                        selectedResults.sensorsWithHUM = selectedResults.sensorsWithHUM + 1;
                        myInfo += "<div><b>Date: </b>" + data[i]["time_cast"] + "</div>";
                      }
                      document.getElementById("info").innerHTML += "<br>" + myInfo;
                      queued++;
                      //console.log("added to list, list size now : " + queued);
                    }
                  }
                  // content for sck sensors
                  else {
                    if(queued < 3) {

                      var content_size = 1;
                      var myInfo = "<div class='text-center'><b>SmartCitizenKit</b></div>"
                      myInfo += "<hr class='divider'/>"
                      myInfo += "<div><b>Name: </b>" + place.name + "</div>";

                      for (let i = 0; i < content_size; i++) {
                          ////////////////////////////////////////////
                          //    update global variables for PM 2.5 //
                          ///////////////////////////////////////////
                          myInfo += "<div><b>PM2.5: </b>" + data[i]["pm25"] + "</div>";
                          if(data[i]["pm25"] > selectedResults.highestPM25) {
                            // update global results variable and respective sensor name fields for PM25
                            selectedResults.highestPM25Name = place.name;
                            selectedResults.highestPM25 = data[i]["pm25"];
                          }
                          // add to average to eventually be calculated by the compare button
                          selectedResults.avgPM25 = parseInt(selectedResults.avgPM25) + parseInt(data[i]["pm25"]);

                          ///////////////////////////////////////////////
                          //    update global variables for PHumidity //
                          //////////////////////////////////////////////
                          myInfo += "<div><b>Humidity: </b>" + data[i]["hum"] + "</div>";
                          // update the global results variable before the compare button is clicked
                          if(data[i]["hum"] > selectedResults.highestHUM) {
                            // update global results variable fields for PM25
                            selectedResults.highestHUMName = place.name;
                            selectedResults.highestHUM = data[i]["hum"];
                          }
                          // add to average to eventually be calculated by the compare button
                          selectedResults.avgHUM = parseInt(selectedResults.avgHUM) + parseInt(data[i]["hum"]);
                          // update number to divide value by
                          selectedResults.sensorsWithHUM = selectedResults.sensorsWithHUM + 1;

                          /////////////////////////////////////////////////
                          //    update global variables for Temperature //
                          ////////////////////////////////////////////////
                          myInfo += "<div><b>Temperature: </b>" + data[i]["temp"] + "</div>";
                          // update the global results variable before the compare button is clicked
                          if(data[i]["temp"] > selectedResults.highestTEMP) {
                            // update global results variable fields for PM25
                            selectedResults.highestTEMPName = place.name;
                            selectedResults.highestTEMP = data[i]["temp"];
                          }
                          // add to average to eventually be calculated by the compare button
                          selectedResults.avgTEMP = parseInt(selectedResults.avgTEMP) + parseInt(data[i]["temp"]);
                          // update number to divide value by
                          selectedResults.sensorsWithTEMP = selectedResults.sensorsWithTEMP + 1;
                          myInfo += "<div><b>Date: </b>" + data[i]["time_cast"] + "</div>";
                      }
                      document.getElementById("info").innerHTML += "<br>" + myInfo;
                      queued++;
                    }
                  }
              }
          });
      });
  }
        // Insert marker into global markers array
        markers[place.id] = marker;
        }
    });
}

// Place SCK markers
function placeSCK(filter, selector) {
    for (let i = 0; i < dataSCK.length; i++) {
        var lat = parseFloat(dataSCK[i]["lat"]);
        var lng = parseFloat(dataSCK[i]["lng"]);
        var owner = dataSCK[i]["owner"]
        var id = dataSCK[i]["device_id"]
        var name = dataSCK[i]["name"];
        var temp = dataSCK[i]["temp"];

        // Place location marker on the map
        var place = {
            type: "sck",
            id: id,
            owner: owner,
            latitude: lat,
            longitude: lng,
            name: name 
        };
        addMarker(place, filter, selector);
    }
}

// Place purpleair markers
function placePA(filter, selector) {
    for (let i = 0; i < dataPA.length; i++) {
        var lat = parseFloat(dataPA[i]["lat"]);
        var lng = parseFloat(dataPA[i]["lng"]);
        var name = dataPA[i]["device_id"];

        // Place location marker on the map
        var place = {
            type: "purpleair",
            latitude: lat,
            longitude: lng,
            id: name,
            name: name 
        };
        addMarker(place, filter, selector);
    }
}

// Place Allegheny County markers
function placeAL(filter, selector) {
    for (let i = 0; i < dataAL.length; i++) {
        var lat = parseFloat(dataAL[i]["lat"]);
        var lng = parseFloat(dataAL[i]["lng"]);
        var site = dataAL[i]["device_id"];

        // Place location marker on the map
        var place = {
            type: "alleghenycounty",
            latitude: lat,
            longitude: lng,
            id: site,
            name: site 
        };
        addMarker(place, filter, selector);
    }
}

// Called by AJAX query functions to filter data when user selects filter option on map
function filterData(filter) {

    this.filter = filter;

  // clear initial map
    markerGroup.clearLayers();

  // add all markers showing temperature
  if(filter == 1) {
    resetUI()
    $('#temp-gradient').toggle();
    placeSCK(filter, 0);
  }
  // add all markers showing Humidity
  else if(filter == 3) {
    resetUI()
    $('#hum-gradient').toggle();
    placeSCK(filter, 0);
    placePA(filter, 0);
  }
  // load all markers as normal / covers for PM2.5 as all show PM2.5
  else {
    resetUI()
    if(filter == 2) { $('#pm25-gradient').toggle(); }
    placeSCK(filter, 0);
    placePA(filter, 0);
    placeAL(filter, 0);
  }
}

// selector values accepted
function handleSelector(selector) {

  if (selector == 1) {
    // remove all current markers
    markerGroup.clearLayers();
    resetUI()
    // user may select their own sensors to compare
    placeSCK(0, selector);
    placePA(0, selector);
    placeAL(0, selector);
    showSensorType();
  }
  else if(selector == 2) {
    // User may select based on sensor
    // remove all current markers
    markerGroup.clearLayers();
    resetUI()

    // user may select their own sensors to compare
    placeSCK(0, selector);
    placePA(0, selector);
    placeAL(0, selector);
    //console.log("placed sensors with selector 2");
    $('#company-box').toggle();
  }
  else if( selector == 3) {
  // User may select based on region

  }
  else { selector = 0; }
}

// generate the results of the user select compare function
function generateResultsUserSelect() {

  var avgH = selectedResults.avgHUM / selectedResults.sensorsWithHUM;
  avgH = Math.round((avgH + Number.EPSILON) * 100) / 100;
  //console.log("Calculating average humidity... " + selectedResults.avgHUM + " / " + selectedResults.sensorsWithHUM);

  var avgP = selectedResults.avgPM25 / queued;
  avgP = Math.round((avgP + Number.EPSILON) * 100) / 100;
  //console.log("Calculating average PM2.5... " + selectedResults.avgPM25 + " / " + queued);

  var avgT = selectedResults.avgTEMP / selectedResults.sensorsWithTEMP;
  avgT = Math.round((avgT + Number.EPSILON) * 100) / 100;
  //console.log("Calculating average temperature... " + selectedResults.avgTEMP + " / " + selectedResults.sensorsWithTEMP);

  //var Results = "<div class='text-center'><b> Comparison Results </b></div>"
  var Results = "<hr class='divider'/>";

  Results += "<br>";
  if ( selectedResults.highestPM25 > 0 || selectedResults.highestHUM > 0 || selectedResults.highestTEMP > 0) { Results += "<div><b>    Averages</b></div>"; }
  if ( selectedResults.highestPM25 > 0) { Results += "<div><b>Average PM 2.5 </b>" + avgP + "</div>"; }
  if ( selectedResults.highestHUM > 0) {  Results += "<div><b>Average Humidity </b>" + avgH + "</div>"; }
  if ( selectedResults.highestTEMP > 0) { Results += "<div><b>Average Temperature </b>" + avgT + "</div>"; }
  Results += "<br>";

  if ( selectedResults.highestTEMP > 0) {
    Results += "<br>";
    Results += "<div><b>Temperature Results </b></div>";
    Results += "<div><i>Highest Temperature : </i>" + selectedResults.highestTEMP + "</div>";
    Results += "<div><i>Highest Temperature Sensor : </i>" + selectedResults.highestTEMPName + "</div>";
    Results += "<br>";
  }

  if ( selectedResults.highestPM25 > 0) {
    Results += "<br>";
    Results += "<div><b>PM 2.5 Results </b></div>";
    Results += "<div><i>Highest PM 2.5 : </i>" + selectedResults.highestPM25 + "</div>";
    Results += "<div><i>Highest PM 2.5 Sensor : </i>" + selectedResults.highestPM25Name + "</div>";
    Results += "<br>";
  }

  if (selectedResults.highestHUM > 0 ) {
    Results += "<br>";
    Results += "<div><b>Humidity Results </b></div>";
    Results += "<div><i>Highest Humidity : </i>" + selectedResults.highestHUM + "</div>";
    Results += "<div><i>Highest Humidity Sensor : </i>" + selectedResults.highestHUMName + "</div>";
    Results += "<br>";
  }

  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  if ($('#company-box').is(":visible")){  $('#company-box').toggle();  }
  //if ($('#type-box').is(":visible")){  $('#type-box').toggle();  }
  document.getElementById("return-info").innerHTML += "<br>" + Results;
  $('#return-box').toggle();

}

// generate the results of the user select compare function
function generateResultsCompanySelect(compNum) {

  document.getElementById("info").innerHTML = "";
  document.getElementById("return-info").innerHTML = "";
  if ($('#return-box').is(":visible")){  $('#return-box').toggle();  }

  var avgHUMSCK = companyResults.avgHUM_SCK / companyResults.sckNum;
  avgHUMSCK = Math.round((avgHUMSCK + Number.EPSILON) * 100) / 100;

  var avgTEMPSCK = companyResults.avgTEMP_SCK / companyResults.sckNum;
  avgTEMPSCK = Math.round((avgTEMPSCK + Number.EPSILON) * 100) / 100;

  var avgPM25SCK = companyResults.avgPM25_SCK / companyResults.sckNum;
  avgPM25SCK = Math.round((avgPM25SCK + Number.EPSILON) * 100) / 100;

  var avgHUMPA = companyResults.avgHUM_PA / companyResults.purpleairNum;
  avgHUMPA = Math.round((avgHUMPA + Number.EPSILON) * 100) / 100;

  var avgPM25PA = companyResults.avgPM25_PA / companyResults.purpleairNum;
  avgPM25PA = Math.round((avgPM25PA + Number.EPSILON) * 100) / 100;

  var avgPM25AL = companyResults.avgPM25_AL / companyResults.alleghenyNum;
  avgPM25AL = Math.round((avgPM25AL + Number.EPSILON) * 100) / 100;
  //var Results = "<div class='text-center'><b> Comparison Results </b></div>"
  var Results = "<hr class='divider'/>";
  Results += "<br>";

  if ( compNum == 1) {
    Results += "<div><b> SmartCitizenKit Data </b></div>";
    Results += "<br>";
    Results += "<div><b>Temperature Results </b></div>";
    Results += "<div><i>Highest Temperature per sensor: </i> " + companyResults.highestTEMP_SCK + "</div>";
    Results += "<div><i>Sensor Name: </i> " + companyResults.highestTEMPName_SCK + "</div>";
    Results += "<div><i>Average Temperature for SCK Sensors: </i> " + avgTEMPSCK + "</div>";
    Results += "<br>";
    Results += "<div><b>PM 2.5 Results </b></div>";
    Results += "<div><i>Highest PM 2.5 per sensor: </i> " + companyResults.highestPM25_SCK + "</div>";
    Results += "<div><i>Sensor Name: </i> " + companyResults.highestPM25Name_SCK + "</div>";
    Results += "<div><i>Average PM 2.5 for SCK Sensors: </i> " + avgPM25SCK + "</div>";
    Results += "<br>";
    Results += "<div><b>Humidity Results </b></div>";
    Results += "<div><i>Highest Humidty per sensor: </i> " + companyResults.highestHUM_SCK + "</div>";
    Results += "<div><i>Sensor Name: </i> " + companyResults.highestHUMName_SCK + "</div>";
    Results += "<div><i>Average Humidty for SCK Sensors: </i> " +avgHUMSCK + "</div>";
    Results += "<br>";
  }
  else if ( compNum == 2 ) {
    Results += "<div><b> PurpleAir Data </b></div>";
    Results += "<br>";
    Results += "<div><b>PM 2.5 Results </b></div>";
    Results += "<div><i>Highest PM 2.5 per sensor: </i>" + companyResults.highestPM25_PA + "</div>";
    Results += "<div><i>Sensor Name: " + companyResults.highestPM25Name_PA + "</div>";
    Results += "<div><i>Average PM 2.5 for PurpleAir Sensors: </i>" + avgPM25PA + "</div>";
    Results += "<br>";
    Results += "<div><b>Humidty Results </b></div>";
    Results += "<div><i>Highest Humidity per sensor: </i> " + companyResults.highestHUM_PA + "</div>";
    Results += "<div><i>Sensor Name: </i> " + companyResults.highestHUMName_PA + "</div>";
    Results += "<div><i>Average Humidty for PurpleAir Sensors: </i> " + avgHUMPA + "</div>";
    Results += "<br>";
  }
  else if ( compNum == 3 ) {
    Results += "<div><b> Allegheny County Data </b></div>";
    Results += "<br>";
    Results += "<div><b>PM 2.5 Results </b></div>";
    Results += "<div><i>Highest PM 2.5: </i> " + companyResults.highestPM25_AL + "</div>";
    Results += "<div><i>Average PM 2.5 for Allegheny Sensors: </i> " + avgPM25AL + "</div>";
    Results += "<br>";
  }
  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  //if ($('#company-box').is(":visible")){  $('#company-box').toggle();  }
  //if ($('#type-box').is(":visible")){  $('#type-box').toggle();  }
  document.getElementById("return-info").innerHTML += "<br>" + Results;
  $('#return-box').toggle();

}

// generate rainbows for filters //
function generateRainbows() {
  // create rainbow objects
  var hum_rainbow = new Rainbow();
  var temp_rainbow = new Rainbow();
  var pm25_rainbow = new Rainbow();
  var select_rainbow = new Rainbow();

  // set range of values for each new rainbow instance //
  hum_rainbow.setNumberRange(0, 80);
  temp_rainbow.setNumberRange(0, 50);
  pm25_rainbow.setNumberRange(0, 150);
  select_rainbow.setNumberRange(0, 200);

  //white --> dark blue //
  hum_rainbow.setSpectrum("F0FFFF", "00008B");
  // white --> blue --> red
  temp_rainbow.setSpectrum("F0FFFF", "0000FF", "F0FFFF", "FFFF00");
  // green --> red //
  pm25_rainbow.setSpectrum("008000", "FFFF00");
  // all blue for selector
  select_rainbow.setSpectrum("0000FF", "0000FF");

  // push new rainbows to global variables //
  humidityRainbow = hum_rainbow;
  temperatureRainbow = temp_rainbow;
  pm25Rainbow = pm25_rainbow;
  selectRainbow = select_rainbow;

}

// Configure application //
function configure() {
    // Update UI
    update();

    /*
    // Configure typeahead
    $("#q").typeahead({
        highlight: false,
        minLength: 1
    },
    {
        display: function(suggestion) { return null; },
        limit: 10,
        source: search,
        templates: {
            suggestion: Handlebars.compile(
                "<div> {{name}} </div>"
            )
        }
    });

    // Re-center map after place is selected from drop-down
    $("#q").on("typeahead:selected", function(eventObject, suggestion, name) {

        // Set map's center
        map.setView(new L.LatLng(suggestion.lat, suggestion.lng));

        // Open ChartJS
        openChart(suggestion.device_id, suggestion.name);

        // Update UI
        update();
    });

    // Re-enable ctrl- and right-clicking (and thus Inspect Element) on Google Map
    // https://chrome.google.com/webstore/detail/allow-right-click/hompjdfbfmmmgflfjdlnkohcplmboaeo?hl=en
    document.addEventListener("contextmenu", function(event) {
        event.returnValue = true;
        event.stopPropagation && event.stopPropagation();
        event.cancelBubble && event.cancelBubble();
    }, true);

    // Update UI
    update();

    // Give focus to text box
    $("#q").focus();
    */
}

// display menu options //
function showFilter() {
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  $('#btn-group').toggle();
}
function showCompare() {
  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  $('#btn-group2').toggle();
}
function showSensorType() {
  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  if ($('#company-box').is(":visible")){  $('#company-box').toggle();  }
  $('#type-box').toggle();
}

// reset map and UI
function reset() {
  // remove all markers
  markerGroup.clearLayers();
  // reset all results boxes and sensor queue for user selection
  clearSensorList();
  // reset UI elements
  document.getElementById("return-info").innerHTML += "";
  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  if ($('#company-box').is(":visible")){  $('#company-box').toggle();  }
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  if ($('#type-box').is(":visible")){  $('#type-box').toggle();  }
  if ($('#return-box').is(":visible")){  $('#return-box').toggle();  }
  if ($('#hum-gradient').is(":visible")){  $('#hum-gradient').toggle();  }
  if ($('#pm25-gradient').is(":visible")){  $('#pm25-gradient').toggle();  }
  if ($('#temp-gradient').is(":visible")){  $('#temp-gradient').toggle();  }

  // place all sensors as normal
  placeSCK(0, 0);
  placePA(0, 0);
  placeAL(0, 0);
}

// reset without removing and replacing markers
function resetUI() {

  // reset results box and sensor queue for user selection
  clearSensorList();
  // reset the UI
  if ($('#btn-group').is(":visible")){  $('#btn-group').toggle();  }
  if ($('#btn-group2').is(":visible")){  $('#btn-group2').toggle();  }
  if ($('#type-box').is(":visible")){  $('#type-box').toggle();  }
  if ($('#return-box').is(":visible")){  $('#return-box').toggle();  }
  if ($('#company-box').is(":visible")){  $('#company-box').toggle();  }
  if ($('#temp-gradient').is(":visible")){  $('#temp-gradient').toggle();  }
  if ($('#hum-gradient').is(":visible")){  $('#hum-gradient').toggle();  }
  if ($('#pm25-gradient').is(":visible")){  $('#pm25-gradient').toggle();  }
}

// clear sensors from selected list and result all return info
// from the compare functions
function clearSensorList() {

  // if the return data is visible, hide it
  if ($('#return-box').is(":visible")){  $('#return-box').toggle();  }

  // reset all results data to empty string
  document.getElementById("info").innerHTML = "";
  document.getElementById("return-info").innerHTML = "";

    // reset all global data for compare functions
    queued = 0;

    selectedResults.highestPM25 = 0;
    selectedResults.highestPM25Name = "";
    selectedResults.highestHUM = 0;
    selectedResults.highestHUMName = "";
    selectedResults.highestTEMP = 0;
    selectedResults.highestTEMPName = "";
    selectedResults.avgPM25 = 0;
    selectedResults.avgHUM = 0;
    selectedResults.avgTEMP = 0;
    //used to divide for averages
    selectedResults.sensorsWithHUM = 0;
    selectedResults.sensorsWithTEMP = 0;
  //console.log("list was cleared, list size now : " + queued);

    companyResults.highestPM25_SCK= 0;
    companyResults.highestPM25Name_SCK= "";
    companyResults.highestPM25_PA= 0;
    companyResults.highestPM25Name_PA= "";
    companyResults.highestPM25_AL= 0;
    companyResults.highestPM25Name_AL= "";

    companyResults.highestHUM_SCK= 0;
    companyResults.highestHUMName_SCK = "";
    companyResults.highestHUM_PA= 0;
    companyResults.highestHUMName_PA= "";

    companyResults.highestTEMP_SCK= 0;
    companyResults.highestTEMPName_SCK= "";

    companyResults.avgPM25_AL= 0;

    companyResults.avgPM25_PA= 0;
    companyResults.avgHUM_PA= 0;

    companyResults.avgHUM_SCK= 0;
    companyResults.avgTEMP_SCK= 0;
    companyResults.avgPM25_SCK= 0;
    //used to divide for averages
    companyResults.sckNum= 0;
    companyResults.alleghenyNum= 0;
    companyResults.purpleairNum= 0;

}

// Remove markers from map //
function removeMarkers() {
    // Remove markers
    for (var place in markers)
    {
      map.removeLayer(markers[place]);
    }

    // Remove references to the markers
    markers.length = 0;
}

// Format SCK content for info window at marker //
function formatInfo(data, name, owner, content_size) {
    var myInfo = "<div class='text-center'><b>SmartCitizenKit</b></div>"
    myInfo += "<hr class='divider'/>"
    // TODO: fix content size
    myInfo += "<div><b>Name: </b>" + name + "</div>";
    myInfo += "<div><b>Owner: </b>" + owner + "</div>";
    for (let i = 0; i < content_size; i++) {
        myInfo += "<div><b>PM2.5: </b>" + data[i]["pm25"] + "</div>";
        myInfo += "<div><b>Humidity: </b>" + data[i]["hum"] + "</div>";
        myInfo += "<div><b>Temperature: </b>" + data[i]["temp"] + "</div>";
        myInfo += "<div><b>Date: </b>" + data[i]["time_cast"] + "</div>";
    }

    return myInfo;
}

// Open listener chart
function openChart(id, name) {
    // Set current marker
    curr_marker = {"type": "sck", "id": id, "name": name, "interval": "10 Minutes"};

    // Set initial timeframe
    timeframe = {"date": "day", "amount": 1}

    // Query PittAir air data for each sensor location
    $.ajax({
        url: '/timeframe',
        type: 'POST',
        data: JSON.stringify({"timeframe": timeframe, "marker": curr_marker}),
        contentType: "application/json",
        dataType: 'json',
        success: function(data) {
            // Prepare data for chart
            pm25s = [];
            dates = [];
            for (let i = 0; i < data.length; i++) {
                var date = toBrowserTimezone(data[i]["time_cast"]);
                var pm25 = data[i]["pm25"];
                dates.push(date);
                pm25s.push(pm25);
            }

            // Show info
            markers[id].bindPopup(formatInfo(data, id, name, 1)).openPopup();

            // If compare button was toggled, display on top of existing chart
            if (compare) {
                var data = [];
                for (let i = 0; i < pm25s.length; i++) {
                    data.push({x: dates[i], y: pm25s[i]});
                }

                var series = {
                    label: name,
                    data: data,
                    fill: false,
                    pointRadius: 1,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: 'rgb(52, 113, 235)',
                    backgroundColor: 'rgb(52, 113, 235)',
                    borderColor: 'rgb(52, 113, 235)',
                };
                chart.data.datasets.push(series);
                chart.update();

                compare = false;
            } else {
                // Create chart
                create_chart(curr_marker, pm25s, init_time_interval, dates);
            }
        }
    });
}

// Show info window at marker with content
function showInfo(marker, content) {
    // Start div
    let div = "<div id='info'>";
    if (typeof(content) == "undefined")
    {
        // http://www.ajaxload.info/
        div += "<img alt='loading' src='/static/ajax-loader.gif'/>";
    }
    else
    {
        div += content;
    }

    // End div
    div += "</div>";

    // Set info window's content
    info.setContent(div);

    // Open info window (if not already open)
    info.open(map, marker);
}

// Create a chart for a marker
function create_chart(curr_marker, sensor_data, time_interval, dates) {
    var name = curr_marker['name'];
    var type = curr_marker['type'];
    var interval = curr_marker['interval'];

    // Reset the timeframe selector
    // $("#timeframe").val("1_day");

    // Display chart
    $('.chart-container').fadeIn();

    // Set chart title
    $('.chart-title').html(`${name}: ${interval} Interval <br> ${filters[filter][1]}`);

    // Destroy existing chart
    if (chart) {
        chart.destroy();
    }

    // List of colors based on marker type
    var colors = {alleghenycounty: 'rgb(235, 64, 52)', purpleair: 'rgb(255, 99, 132)', pittair: 'rgb(52, 113, 235)', sck: 'rgb(245, 206, 66)'}
    var fill_colors = {alleghenycounty: 'rgba(235, 64, 52, 0.3)', purpleair: 'rgba(255, 99, 132, 0.3)', pittair: 'rgba(52, 113, 235, 0.3)', sck: 'rgba(245, 206, 66, 0.3)'}

    // Format the data into {x: date, y: sensor-value}
    var data = [];
    for (let i = 0; i < sensor_data.length; i++) {
        data.push({x: dates[i], y: sensor_data[i]});
    }

    // Create the dataset object for the chart
    var curr_filter = filters[filter][0];
    var series = {
        label: name,
        data: data,
        fill: true,
        pointRadius: 1,
        pointHoverRadius: 5,
    };

    // Use filter color if a filter is selected, otherwise use marker color
    if (filter == 0) {
        series['pointHoverBackgroundColor'] = colors[type];
        series['backgroundColor'] = fill_colors[type];
        series['borderColor'] = colors[type];
    }
    else {
        series['pointHoverBackgroundColor'] = chart_border_colors[curr_filter];
        series['backgroundColor'] = chart_fill_colors[curr_filter];
        series['borderColor'] = chart_border_colors[curr_filter];
    }

    // Create the chart
    var time_translations = {'hour': "hour", 'day': "hour", 'week': "day", 'month': "week", 'year': "month"}; /* e.g., month in Chart.JS corresponds to displaying by month */
    time_interval = time_translations[time_interval]
    xAxes = [{
        type: 'time',
        time: {
            unit: time_interval,
            displayFormats: {
                'hour': 'HH:mm:ss',
                'week': 'MMM D',
                'month': 'll',
                'year': 'MMM YYYY'
            },
        },
        ticks: {
            minRotation: 0,
            maxRotation: 0,
            maxTicksLimit: 5,
            callback: function(value, index, values) {
                // Format date
                return value;
            }
        }
    }];
    var ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [series]
        },
        options: {

            legend: {
                display: true,
                position: 'bottom'
            },
            tooltips: {
                callbacks: {
                    title: function(tooltipItem, data) {
                        // Format tooltip string title
                        return tooltipItem[0].xLabel;
                    },
                    label: function(tooltipItem, data) {
                        // Format the tooltip string label
                        var label = data.datasets[tooltipItem.datasetIndex].label;
                        return label;
                    }
                }
            },
            scales: {
                xAxes: xAxes,
                yAxes: [{
                  ticks: {
                    beginAtZero: true
                  }
                }]
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Update UI's markers 
function update() {
    /*
    $.getJSON("/update", parameters, function(data, textStatus, jqXHR) {

       // Remove old markers from map
       removeMarkers();

       // Add new markers to map
       for (let i = 0; i < data.length; i++)
       {
           addMarker(data[i]);
       }
    });
    */
};

// Format date to MONTH DAY, YEAR
function format_date(date) {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    let month = monthNames[date.getMonth()];
    let day = String(date.getDate()).padStart(2, '0');
    //let year = date.getFullYear();
    return month + " " + day;
}

// Convert date string to date object
function string_to_date(date) {
    var date_parts = date.split("/");
    var day = date_parts[0];
    var month = date_parts[1];
    var year = date_parts[2].split(/[ ,]+/)[0];
    var dateObject = new Date(year, month - 1, day);
    return dateObject;
}

// Obtain today's date
function todaysDate() {
    let date = new Date();
    return format_date(date);
}

function toBrowserTimezone(date) {
    var offset = new Date().getTimezoneOffset();
    return moment.utc(date).utcOffset(-offset).format("YYYY-MM-DD HH:mm:ss");
}

////////////////////////////////////////////////////////////////////////////////
/*                                                                           ///
///                         RainbowVis-JS                                    ///
///           Released under Eclipse Public License - v 1.0                  ///
/                 github.com/anomal/RainbowVis-JS                            ///
*/                                                                           ///
////////////////////////////////////////////////////////////////////////////////
function Rainbow() {
	"use strict";
	var gradients = null;
	var minNum = 0;
	var maxNum = 100;
	var colours = ['ff0000', 'ffff00', '00ff00', '0000ff'];
	setColours(colours);

	function setColours (spectrum)
	{
		if (spectrum.length < 2) {
			throw new Error('Rainbow must have two or more colours.');
		} else {
			var increment = (maxNum - minNum)/(spectrum.length - 1);
			var firstGradient = new ColourGradient();
			firstGradient.setGradient(spectrum[0], spectrum[1]);
			firstGradient.setNumberRange(minNum, minNum + increment);
			gradients = [ firstGradient ];

			for (var i = 1; i < spectrum.length - 1; i++) {
				var colourGradient = new ColourGradient();
				colourGradient.setGradient(spectrum[i], spectrum[i + 1]);
				colourGradient.setNumberRange(minNum + increment * i, minNum + increment * (i + 1));
				gradients[i] = colourGradient;
			}

			colours = spectrum;
		}
	}

	this.setSpectrum = function ()
	{
		setColours(arguments);
		return this;
	}

	this.setSpectrumByArray = function (array)
	{
		setColours(array);
		return this;
	}

	this.colourAt = function (number)
	{
		if (isNaN(number)) {
			throw new TypeError(number + ' is not a number');
		} else if (gradients.length === 1) {
			return gradients[0].colourAt(number);
		} else {
			var segment = (maxNum - minNum)/(gradients.length);
			var index = Math.min(Math.floor((Math.max(number, minNum) - minNum)/segment), gradients.length - 1);
			return gradients[index].colourAt(number);
		}
	}

	this.colorAt = this.colourAt;

	this.setNumberRange = function (minNumber, maxNumber)
	{
		if (maxNumber > minNumber) {
			minNum = minNumber;
			maxNum = maxNumber;
			setColours(colours);
		} else {
			throw new RangeError('maxNumber (' + maxNumber + ') is not greater than minNumber (' + minNumber + ')');
		}
		return this;
	}
}

function ColourGradient() {
	"use strict";
	var startColour = 'ff0000';
	var endColour = '0000ff';
	var minNum = 0;
	var maxNum = 100;

	this.setGradient = function (colourStart, colourEnd)
	{
		startColour = getHexColour(colourStart);
		endColour = getHexColour(colourEnd);
	}

	this.setNumberRange = function (minNumber, maxNumber)
	{
		if (maxNumber > minNumber) {
			minNum = minNumber;
			maxNum = maxNumber;
		} else {
			throw new RangeError('maxNumber (' + maxNumber + ') is not greater than minNumber (' + minNumber + ')');
		}
	}

	this.colourAt = function (number)
	{
		return calcHex(number, startColour.substring(0,2), endColour.substring(0,2))
			+ calcHex(number, startColour.substring(2,4), endColour.substring(2,4))
			+ calcHex(number, startColour.substring(4,6), endColour.substring(4,6));
	}

	function calcHex(number, channelStart_Base16, channelEnd_Base16)
	{
		var num = number;
		if (num < minNum) {
			num = minNum;
		}
		if (num > maxNum) {
			num = maxNum;
		}
		var numRange = maxNum - minNum;
		var cStart_Base10 = parseInt(channelStart_Base16, 16);
		var cEnd_Base10 = parseInt(channelEnd_Base16, 16);
		var cPerUnit = (cEnd_Base10 - cStart_Base10)/numRange;
		var c_Base10 = Math.round(cPerUnit * (num - minNum) + cStart_Base10);
		return formatHex(c_Base10.toString(16));
	}

	function formatHex(hex)
	{
		if (hex.length === 1) {
			return '0' + hex;
		} else {
			return hex;
		}
	}

	function isHexColour(string)
	{
		var regex = /^#?[0-9a-fA-F]{6}$/i;
		return regex.test(string);
	}

	function getHexColour(string)
	{
		if (isHexColour(string)) {
			return string.substring(string.length - 6, string.length);
		} else {
			var name = string.toLowerCase();
			if (colourNames.hasOwnProperty(name)) {
				return colourNames[name];
			}
			throw new Error(string + ' is not a valid colour.');
		}
	}

	// Extended list of CSS colornames s taken from
	// http://www.w3.org/TR/css3-color/#svg-color
	var colourNames = {
		aliceblue: "F0F8FF",
		antiquewhite: "FAEBD7",
		aqua: "00FFFF",
		aquamarine: "7FFFD4",
		azure: "F0FFFF",
		beige: "F5F5DC",
		bisque: "FFE4C4",
		black: "000000",
		blanchedalmond: "FFEBCD",
		blue: "0000FF",
		blueviolet: "8A2BE2",
		brown: "A52A2A",
		burlywood: "DEB887",
		cadetblue: "5F9EA0",
		chartreuse: "7FFF00",
		chocolate: "D2691E",
		coral: "FF7F50",
		cornflowerblue: "6495ED",
		cornsilk: "FFF8DC",
		crimson: "DC143C",
		cyan: "00FFFF",
		darkblue: "00008B",
		darkcyan: "008B8B",
		darkgoldenrod: "B8860B",
		darkgray: "A9A9A9",
		darkgreen: "006400",
		darkgrey: "A9A9A9",
		darkkhaki: "BDB76B",
		darkmagenta: "8B008B",
		darkolivegreen: "556B2F",
		darkorange: "FF8C00",
		darkorchid: "9932CC",
		darkred: "8B0000",
		darksalmon: "E9967A",
		darkseagreen: "8FBC8F",
		darkslateblue: "483D8B",
		darkslategray: "2F4F4F",
		darkslategrey: "2F4F4F",
		darkturquoise: "00CED1",
		darkviolet: "9400D3",
		deeppink: "FF1493",
		deepskyblue: "00BFFF",
		dimgray: "696969",
		dimgrey: "696969",
		dodgerblue: "1E90FF",
		firebrick: "B22222",
		floralwhite: "FFFAF0",
		forestgreen: "228B22",
		fuchsia: "FF00FF",
		gainsboro: "DCDCDC",
		ghostwhite: "F8F8FF",
		gold: "FFD700",
		goldenrod: "DAA520",
		gray: "808080",
		green: "008000",
		greenyellow: "ADFF2F",
		grey: "808080",
		honeydew: "F0FFF0",
		hotpink: "FF69B4",
		indianred: "CD5C5C",
		indigo: "4B0082",
		ivory: "FFFFF0",
		khaki: "F0E68C",
		lavender: "E6E6FA",
		lavenderblush: "FFF0F5",
		lawngreen: "7CFC00",
		lemonchiffon: "FFFACD",
		lightblue: "ADD8E6",
		lightcoral: "F08080",
		lightcyan: "E0FFFF",
		lightgoldenrodyellow: "FAFAD2",
		lightgray: "D3D3D3",
		lightgreen: "90EE90",
		lightgrey: "D3D3D3",
		lightpink: "FFB6C1",
		lightsalmon: "FFA07A",
		lightseagreen: "20B2AA",
		lightskyblue: "87CEFA",
		lightslategray: "778899",
		lightslategrey: "778899",
		lightsteelblue: "B0C4DE",
		lightyellow: "FFFFE0",
		lime: "00FF00",
		limegreen: "32CD32",
		linen: "FAF0E6",
		magenta: "FF00FF",
		maroon: "800000",
		mediumaquamarine: "66CDAA",
		mediumblue: "0000CD",
		mediumorchid: "BA55D3",
		mediumpurple: "9370DB",
		mediumseagreen: "3CB371",
		mediumslateblue: "7B68EE",
		mediumspringgreen: "00FA9A",
		mediumturquoise: "48D1CC",
		mediumvioletred: "C71585",
		midnightblue: "191970",
		mintcream: "F5FFFA",
		mistyrose: "FFE4E1",
		moccasin: "FFE4B5",
		navajowhite: "FFDEAD",
		navy: "000080",
		oldlace: "FDF5E6",
		olive: "808000",
		olivedrab: "6B8E23",
		orange: "FFA500",
		orangered: "FF4500",
		orchid: "DA70D6",
		palegoldenrod: "EEE8AA",
		palegreen: "98FB98",
		paleturquoise: "AFEEEE",
		palevioletred: "DB7093",
		papayawhip: "FFEFD5",
		peachpuff: "FFDAB9",
		peru: "CD853F",
		pink: "FFC0CB",
		plum: "DDA0DD",
		powderblue: "B0E0E6",
		purple: "800080",
		red: "FF0000",
		rosybrown: "BC8F8F",
		royalblue: "4169E1",
		saddlebrown: "8B4513",
		salmon: "FA8072",
		sandybrown: "F4A460",
		seagreen: "2E8B57",
		seashell: "FFF5EE",
		sienna: "A0522D",
		silver: "C0C0C0",
		skyblue: "87CEEB",
		slateblue: "6A5ACD",
		slategray: "708090",
		slategrey: "708090",
		snow: "FFFAFA",
		springgreen: "00FF7F",
		steelblue: "4682B4",
		tan: "D2B48C",
		teal: "008080",
		thistle: "D8BFD8",
		tomato: "FF6347",
		turquoise: "40E0D0",
		violet: "EE82EE",
		wheat: "F5DEB3",
		white: "FFFFFF",
		whitesmoke: "F5F5F5",
		yellow: "FFFF00",
		yellowgreen: "9ACD32"
	}
}

if (typeof module !== 'undefined') {
  module.exports = Rainbow;
}
