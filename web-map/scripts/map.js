var map; // Global variable to store the Leaflet map
var towns; // GeoJSON layer for town boundaries
var townActive; // Selected town name

var dataLayer; // GeoJSON layer with district data
var overlays = {};  // An object to contain overlay layer groups, eg `transit`

var zone2color = {
  'R': '#0c7489', // primarily residential, satisfied
  'M': '#9ad2cb', // mixed with residential, satisfied
  'N': '#d6975c', // nonresidential, satisfied
  'NS': '#f2eeeb', // not satisfied
}

// Columns in the original spreadsheet
var zName = 'Z';
var zTown = 'T';
var zType = 'Ty';
var zAcres = 'MA'; // municipal area

var style = function(filters, feature) {
  var opacity = $('input[name="opacity"]').val() / 100;
  return {
    fillOpacity: opacity,
    fillColor: satisfiesFilters(filters, feature) ? zone2color[feature.properties[zType]] : zone2color['NS'],
    weight: 0
  }
}

var updateUrl = function() {
  var mapLocationHash = location.hash.split('/').slice(0,3).join('/');
  // Update URL
  location.replace(mapLocationHash + '/' + $('#form').serialize() );
}

/**
 * Loads the main GeoJSON data file
 */
var loadZones = function(geojson) {

  var filters = getFilters();

  dataLayer = L.geoJSON(geojson, {
    attribution: 'data by the <a href="https://www.frontierinstitute.org/">Frontier Institute</a>,\
      map development by the <a href="https://zoningatlas.org">National Zoning Atlas</a>. Supporting data from the Montana State Library and Living Atlas of the World.',
    style: function(feature) { return style(filters, feature) },
    onEachFeature: function(feature, layer) {

      var pp = feature.properties;

      // On layer click, select town
      layer.on('click', function() {

        var townClicked = pp[zTown];
        townActive = townClicked === townActive ? '' : townClicked;

        // Select a town which contains the clicked district
        $('input[name="townActive"]').val(townActive);

        // Draw active boundary
        towns.setStyle( townStyle );

        // Recalculate area
        calculateActiveArea();

        if (townActive) {
          // Fit town to center
          towns.eachLayer(function(l) {
            if (l.feature.properties.NAME10 === townActive) {
              map.fitBounds( l.getBounds() );
              setTimeout(updateUrl, 500);
            }
          });
        } else {
          // Deactivate
          updateUrl();
        }

      });

      // Add tooltip
      layer.bindTooltip(!pp[zName] || pp[zName] === 'Not Zoned' || pp[zName] === 'NULL'
        ? '<strong>Not Zoned</strong><br>' + pp[zTown]
        : '<h6 class="t-t ttu">' + pp[zName] + '</h6><strong class="black-50">' + pp[zTown] + '</strong><br>'
          + ( pp['AHT'] == 'A' ? '<strong>Affordable Housing Incentive(s) Available!</strong><br> The definition of affordable housing in this district is: ' + '"' + pp['AHD'] + '"' + '<br>': '' )
          + ( pp['EHD'] == 'Yes' ? 'Elderly Housing Only<br>' : '' )
          + ( pp['MUS'] == '1' ? 'Requires a Minimum Home Size<br>' : '' )
          + ( pp['PK'] && pp['PK'].length > 1 ? '<strong>Parking Required: </strong>' + pp['PK'] + '<br>' : '' )   
          + ( pp['TN'] ? '<strong>Note:</strong> ' + pp['TN']: '' ),
          
        { sticky: true } );
    }

  }).addTo(map);


  // Turn on federal/state land by default
  // $('input[name="Overlay"][value="fs"]').prop('checked', true);

  // Add selected overlays to the map
  $('input[name="Overlay"]:checked').each(function(i, el) {
    if (overlays[el.value]) {
      overlays[el.value].addTo(map);
    }
  });


  var form = document.getElementById('form');
  
  form.addEventListener('change', function() {
    updateUrl();

    var filters = getFilters();
    dataLayer.setStyle(function(feature) { return style(filters, feature) });

    // Make sure groups of checkboxes where at least one is expected to be checked
    // turns red if none are checked (and vice-versa)
    $('.at-least-one-checked:has( input:checked )').removeClass('bg-light-red');
    $('.at-least-one-checked:not(:has( input:checked ))').addClass('bg-light-red');

    calculateActiveArea();

    $('input[name="Overlay"]').each(function(i, el) {
      var value = el.value;
      if (filters['Overlay'] && filters['Overlay'].indexOf( value ) >= 0) {
        overlays[value].addTo(map);
      } else {
        if (map.hasLayer(overlays[value])) {
          map.removeLayer(overlays[value])
        }
      }
    });

    if ( $('.main-in-group:checked').length > 0 ) {
      $('#resetFilters').show();
    } else {
      $('#resetFilters').hide();
    }

  });

  // When main checkbox in filters group is clicked, open up subgroup
  $('.main-in-group').change(function() {
    var subgroup = $(this).parent().siblings('.subgroup').first();
    if (this.checked) {
      subgroup.removeClass('dn');
      subgroup.find('input.checked-by-default').prop('checked', true);
    } else {
      subgroup.find('input[type="checkbox"]').prop('checked', false);
      subgroup.addClass('dn');
    }
  });

  calculateActiveArea();

}

/*
 * On page loads, sets filters based on the URL
 */
var setFilters = function() {
  var filters = $.unserialize(
    location.hash.split('/').slice(3).join('/')
  );

  if (filters['townActive']) {
    townActive = filters['townActive'];
    $('input[name="townActive"').val(townActive);
  }

  for (var filter in filters) {
    var value = filters[filter];

    if (filter === 'opacity') {
      $('input[name="' + filter + '"]').val(value);

    } else if (typeof value === 'string') {
      $('input[name="' + filter + '"][value="' + value + '"]'  ).prop('checked', true);
    
    } else {
      for (var i in value) {
        $('input[name="' + filter + '"][value="' + value[i] + '"]'  ).prop('checked', true);
      }      
    }
    
  }

  $('input.main-in-group:checked').parents().siblings('.subgroup').removeClass('dn');
  $('.at-least-one-checked:has( input:checked )').removeClass('bg-light-red');
  $('.at-least-one-checked:not(:has( input:checked ))').addClass('bg-light-red');

  if ( $('.main-in-group:checked').length > 0 ) {
    $('#resetFilters').show();
  } else {
    $('#resetFilters').hide();
  }

  // Add event listener to the clear filters button
  $('#resetFilters').on('click', function() {
    // Clear town selection
    townActive = '';
    towns.setStyle( townStyle );

    // Clear filters
    $('.main-in-group:checked').click();

    // Hide button
    $(this).hide();
  });
  
}


/*
 * Constructs and returns a `filters` object based on the form in the sidebar
 */
var getFilters = function() {

  var filters = {};

  var checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
  for (var i = 0; i < checkboxes.length; i++) {
    var name = checkboxes[i].name;
    var value = checkboxes[i].value;

    if (!name || !value) continue;

    if ( !filters[name] ) { filters[name] = []; }
    filters[name].push(value);
  }

  return filters;

}

/*
 * Given a `filters` object, returns true if all residential property
 * checkboxes are satisfied by the `feature` (zone), `false` otherwise.
 */ 
var satisfiesFilters = function(filters, feature) {

  for (var name in filters) {
    if (name === 'Overlay') continue;

    if ( filters[name].indexOf( feature.properties[name] ) < 0 ) {
      return false;
    }
  }
  return true;
}

/*
 * Adds zone type box colors to the legend
 */
var addColorPolygonsToLegend = function() {

  $('#legend .square').each(function() {
    $(this).css('background-color', zone2color[$(this).attr('title')] );
  });

}

/*
 * Defines style for 169 town outlines: yellow if selected,
 * semi-transparent white if not
 */
var townStyle = function(feature) {
  return {
    stroke: feature.properties.Jurisdiction === townActive ? 2 : 1,
    color: feature.properties.Jurisdiction === townActive ? '#242c38' : '#f7f9f7',
    opacity: feature.properties.Jurisdiction === townActive ? 0.6 : 0.4,
    fillOpacity: 0,
    fillColor: 'rgba(0,0,0,0)'
  }
}


/*
 * Given towns GeoJSON file in `bounds`, adds non-interactivve town boundaries
 * layer to the map
 */
var loadTowns = function(bounds) {

  towns = L.geoJSON(bounds, {
    pane: 'overlays',
    interactive: false,
    style: townStyle
  });

  towns.addTo(map);
}

var loadState = function(bounds) {

  towns = L.geoJSON(bounds, {
    pane: 'overlays',
    interactive: false,
    style: stateStyle
  });

  towns.addTo(map);
}

var stateStyle = {
  stroke: .75,
  color: '#242c38',
  fill: false,
  opacity: 0.6,
}

var loadStateLand = function(bounds) {
  $.getJSON('data/StateLand.geojson', function(geojson) {

    var stripes = new L.StripePattern({
      height: 2,
      width: 2,
      weight: 1,
      spaceWeight: 1,
      angle: 60,
      color: '#ab4962',
    });
    stripes.addTo(map);

    overlays['sl'] = L.geoJSON(geojson, {
      interactive: false,
      stroke: false,
      pane: 'overlays',
      style: {
        fillOpacity: 1,
        fillPattern: stripes
      }
    })

  });
}



/*
 * Calculates what % of a selected town satisfies filtering criteria,
 * and updates the message in the sidebar 
 */
var calculateActiveArea = function() {

  if (!townActive) {
    $('#activeAreaCalculator').html('').addClass('dn');
    return;
  }

  var filters = getFilters();
  
  var totalAcres = 0;
  var satisfiesAcres = 0;
  
  dataLayer.eachLayer(function(l) {
    if (l.feature.properties[zTown] === townActive) {
      totalAcres += l.feature.properties[zAcres] || 0;
      if (satisfiesFilters(filters, l.feature)) {
        satisfiesAcres += l.feature.properties[zAcres] || 0;
      }
    }
  });

  var satisfiesPerc = (satisfiesAcres / totalAcres * 100).toFixed(1);
  satisfiesAcres = parseInt(satisfiesAcres).toLocaleString();
  totalAcres = parseInt(totalAcres).toLocaleString();

  $('#activeAreaCalculator').html('<p class="ma0 mb2">' + satisfiesAcres + ' acres, or ' + satisfiesPerc
    + '% of <span class="bb-dotted" title="Excludes state- and federal-owned land, and unzoned parts of town">zoned municipal area</span> in <strong>' + townActive + '</strong> (' + totalAcres
    + ' acres) satisfies your filtering criteria.</p><div style="font-size: 13px"><span class="black-50 dib w-third fl tl" title="Median Household Income">');
    // + '<span class="material-icons v-top" style="font-size:16px">payments</span> $' + demographics[townActive].income.toLocaleString()
    // + '<br>HH Income</span><span class="black-50 dib w-third fl tc" title="Black, Indigenous, People of Color">'
    // + '<span class="material-icons v-top" style="font-size:16px">people_alt</span> ' + demographics[townActive].bipoc
    // + '%<br>BIPOC</span><span class="black-50 dib fl ml2 tr" title="Cost-Burdened Households">'
    // + '<span class="material-icons v-top" style="font-size:16px">toll</span> ' + demographics[townActive].burdened + '%<br>Cost-Burdened</span>'
    // + '</div>');
  $('#activeAreaCalculator').removeClass('dn');

}


/*
 * Creates a layer group of rail/fastrak markers from `transit.js` data.
 */ 
var loadTransit = function() {

  var transitMarkers = transit.map(function(o) {
    return L.marker([o.Latitude, o.Longitude], {
      icon: L.icon({
        iconUrl: 'img/' + o.Mode + '.png',
        iconSize: o.Mode === 'rail' ? [24, 24] : [16, 16],
        iconAnchor: o.Mode === 'rail' ? [12, 12] : [8, 8],
      })
    }).bindTooltip(o.Name + '<br> <em class="ttc">' + o.Mode + '</em>')
  });

  var transitCircles = transit.map(function(o) {
    return L.circle([o.Latitude, o.Longitude], {
      radius: 804.5, // half a mile, in meters
      weight: 1,
      color: 'white',
      fillColor: 'white',
      opacity: 0.9,
      fillOpacity: 0.2,
      interactive: false
    });
  });

  overlays['transit'] = L.layerGroup( transitCircles.concat(transitMarkers) );

}


var loadHydro = function() {

  $.getJSON('./data/hydro.min.geojson', function(geojson) {

    var stripes = new L.StripePattern({
      height: 2,
      width: 2,
      weight: 1,
      spaceWeight: 1,
      angle: -45,
      color: '#C6DDFF',
    });
    stripes.addTo(map);

    overlays['hydro'] = L.geoJSON(geojson, {
      interactive: false,
      stroke: false,
      pane: 'overlays',
      style: {
        fillOpacity: 1,
        fillPattern: stripes
      }
    })

  });

}


var loadTribes = function() {

  $.getJSON('data/TribalLand.geojson', function(geojson) {

    var stripes = new L.StripePattern({
      height: 4,
      width: 4,
      weight: 1,
      spaceWeight: 3,
      angle: 45,
      color: '#e8f99d',
    });
    stripes.addTo(map);

    overlays['tribes'] = L.geoJSON(geojson, {
      interactive: false,
      stroke: false,
      pane: 'overlays',
      style: {
        fillOpacity: 1,
        fillPattern: stripes
      }
    })

  });

}


var loadFederalState = function() {

  $.getJSON('./data/MT-federal.geojson', function(geojson) {

    var stripes = new L.StripePattern({
      height: 2,
      width: 2,
      weight: 1,
      spaceWeight: 1,
      angle: 30,
      color: '#5cc649',
    });
    stripes.addTo(map);

    overlays['fs'] = L.geoJSON(geojson, {
      interactive: false,
      stroke: false,
      pane: 'overlays',
      style: {
        fillOpacity: 1,
        fillPattern: stripes
      }
    })

  });
}


/**
 * This function initializes the map. It should be called as soon as
 * DOM is loaded.
 */
var initMap = function() {
  map = L.map('map', {
    zoomControl: false,
    tap: false,
    maxZoom: 15,
  }).setView([46.866, -113.347], 7);

  L.control.zoom({ position: 'topright' }).addTo(map);

  // CartoDB Positron baselayer, no labels
  var cartoTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var esriTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  // Add base layer switch
  L.control.layers({
    'Map': cartoTiles,
    'Satellite': esriTiles
  }, {}, {
    position: 'bottomright',
    collapsed: false
  }).addTo(map);


  // CartoDB Positron baselayer, no labels
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'shadowPane'
  }).addTo(map);

  setFilters();

  // Add state boundary from geojson
  $.getJSON('data/MontanaBoundary.geojson', loadState);

  // Load town boundaries
  $.getJSON('data/Jurisdictions.geojson', loadTowns);

  // Load main data GeoJSON with zones
  $.getJSON('./data/final.geojson', loadZones);

  

  // Add hash
  var hash = new L.Hash(map);

  // Add color polygons to legend
  addColorPolygonsToLegend();

  // Create overlays pane
  map.createPane('overlays');
  map.getPane('overlays').style.zIndex = 501;
  
  // Add overlays
  loadTransit();
  loadHydro();
  loadTribes();
  loadFederalState();
  loadStateLand();

  // Add Esri geocoder
  var searchControl = L.esri.Geocoding.geosearch({
    position: 'topright',
    allowMultipleResults: false,
    searchBounds: [[40.98, -73.74], [42.04, -71.78]]
  }).addTo(map);

  var results = L.layerGroup().addTo(map);

  searchControl.on('results', function (data) {
    results.clearLayers();
    for (var i = data.results.length - 1; i >= 0; i--) {
      results.addLayer(L.marker(data.results[i].latlng));
    }
  });

  // Start tour
  var driver = new Driver({
    animate: false,
    allowClose: false,
  });
  // Define the steps for introduction
  driver.defineSteps([
    /*{
      element: '#CtZoningAtlas',
      popover: {
        title: 'Connecticut Zoning Atlas',
        description: 'Zoning laws covering nearly every inch of Connecticut tell us what can be built, where.  They say whether we can have single-family housing in one neighborhood, or apartment buildings in another. This interactive map was drawn from our survey of all 2,616 zoning districts in 178 zoning jurisdictions in the state, as well as 2 subdivision-only jurisdictions in the 2 towns without zoning.  We think it shows how outdated zoning laws make it hard to build diverse, affordable housing.',
        position: 'right'
      }
    },*/
    {
      element: '#TypeOfZoningDistrict',
      popover: {
        title: 'What are the Zoning Districts?',
        description: '<p>We have put the zoning districts in each town into one of three categories: \
          <ul><li><strong>Primarily Residential</strong>: Districts where housing is the main use. They may also include things you might find in residential neighborhoods, like schools and churches.  We included farming-residential districts in rural towns in this category.</li>\
          <li> <strong>Mixed with Residential</strong>: Districts where housing and retail, office, or other commercial uses mix together. They are typically districts around our “main streets” or in areas meant to be developed flexibly.</li>\
          <li> <strong>Nonresidential</strong>: Districts where housing is not allowed to be an independent use. However, some nonresidential districts allow accessory dwelling units, like an apartment for a night watchman in a factory setting.</li></ul></p>',
        position: 'right'
      }
    },
    {
      element: '#PermittedResidentialUses',
      popover: {
        title: 'Select Permitted Residential Uses',
        description: '<p>Select one or more of the <strong>Permitted Residential Uses</strong> from the menu on the left-hand side of this screen. The purple and pink hues on the map will show you what kind of zoning district the chosen residential use appears in.</p>\
        <p>Explore the specific conditions under which your selected Permitted Residential Use is allowed, like <strong>minimum lot size</strong> requirements, <strong>public hearing</strong> requirements, or restrictions for <strong>elderly housing</strong>.</p>',
        position: 'right'
      },
      onNext: function() {
        // Make sure calculator displays on top of map in the next step
        driver.preventMove();
        $('#activeAreaCalculator').css('z-index', '110000');
        driver.moveNext();
      }
    },
    {
      element: '#map',
      popover: {
        title: 'Click the Map to Learn About Your Town',
        description: 'Click the map for the popup to appear on top of the map. It will tell you what percent of land satisfies your selection criteria, as well as\
          median household income, the percent of people cost-burdened (spending 30% or more of their income on housing), and what percent of the population identifies as Black, Indigenous, or as a person of color (BIPOC).',
        position: 'mid-center',
      },
      onNext: function() {
        driver.preventMove();
        $('#activeAreaCalculator').css('z-index', '999');
        driver.moveNext();
      }
    },
    {
      element: '#Overlays',
      popover: {
        title: 'Explore the Overlays',
        description: 'You can toggle between the <strong>Transit and Waterways \
          Overlays</strong> to visualize areas within a half mile of passenger rail and \
          CT<i>fastrak</i>, as well as bodies of water within the state.',
        position: 'right'
      }
    },
    {
      element: '.leaflet-control-layers-list',
      popover: {
        title: 'Change the Basemap',
        description: 'Would you prefer to view the Atlas from a bird\'s eye view? Click "Satellite" at the bottom right in the map.',
        position: 'top-right'
      }
    },
    {
      element: '#ZoneOpacity',
      popover: {
        title: 'Adjust Zone Opacity',
        description: 'Move the slider to adjust zoning layer transparency.',
        position: 'right'
      }
    }
  ]);
  // Start the introduction
  driver.start();

}

// Initialize the map when DOM is loaded
document.addEventListener('DOMContentLoaded', initMap);