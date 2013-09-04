// ==UserScript==
// @id             iitc-plugin-portal-energy-statistics
// @name           IITC plugin: Portal Energy Statistics
// @category       Info
// @version        0.0.1.@@DATETIMEVERSION@@
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Display a sortable list of all visible portals with details about energy levels such as cost to recharge, total XM level, daily recharge cost, and time to decay.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

/* Changelog
* 0.0.1 : Initial release.  Much more to come.
*
* Display code inspired from @vita10gy's scoreboard plugin : iitc-plugin-scoreboard@vita10gy - https://github.com/breunigs/ingress-intel-total-conversion
* Portal link code from xelio - iitc: AP List - https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/plugins/ap-list.user.js
*
* @todo Add filter for "show only critical (about to decay)" portals.
* @todo Add priority sort for urgency.  Factor in whether resos are about to
*       decay, whether the portal's level will drop, mods, etc.
* @todo Integrate with "portal keys" and other "favorites" plugins to add
*       filters like "show only portals for which I have keys"
* @todo Add column for "days until level drop"
* @todo Add filter/column for "resonators about to decay" -- distinct from
*       portal level.
*/ 

// use own namespace for plugin
window.plugin.portal_energy_statistics = function() {};

window.plugin.portal_energy_statistics.listPortals = []; // structure : name, team, level, resonators = Array, Shields = Array, APgain
window.plugin.portal_energy_statistics.sortOrder=-1;    
window.plugin.portal_energy_statistics.enlP = 0;
window.plugin.portal_energy_statistics.resP = 0;
window.plugin.portal_energy_statistics.filter=0;


//fill the listPortals array with portals avalaible on the map (level filtered portals will not appear in the table)
window.plugin.portal_energy_statistics.getPortals = function() {
  //filter : 0 = All, 1 = Res, 2 = Enl
  //console.log('** getPortals');
  var retval=false;

  var displayBounds = map.getBounds();

  window.plugin.portal_energy_statistics.listPortals = [];
  //get portals informations from IITC
  $.each(window.portals, function(i, portal) {
    // eliminate offscreen portals (selected, and in padding)
    if(!displayBounds.contains(portal.getLatLng())) return true;

    retval=true;
    var d = portal.options.details;
    var name =  d.portalV2.descriptiveText.TITLE;
    var address = d.portalV2.descriptiveText.ADDRESS;
    var img = d.imageByUrl && d.imageByUrl.imageUrl ? d.imageByUrl.imageUrl : DEFAULT_PORTAL_IMG;
    var team = portal.options.team;
    switch (team){
      case 1 :
        window.plugin.portal_energy_statistics.resP++;
        break;
      case 2 :
        window.plugin.portal_energy_statistics.enlP++;
        break;
    }
    var level = getPortalLevel(d).toFixed(2);
    var guid = portal.options.guid;


    //get resonators informations
    var resonators = []; // my local resonator array : reso level, reso deployed by, distance to portal, energy total, max 
    var energy = 0;
    var maxenergy=0;
    var max_days_till_decay=0;
    var days_till_decay='unk';
    var decay_time='n/a';
    var decay_days_high_resolution = 0;
    var capture_time = 0;
    var capture_hours = 0;

    if(d.hasOwnProperty('captured') && d.captured.hasOwnProperty('capturedTime')) {
      capture_time = new Date(parseInt(d.captured.capturedTime));
      capture_hours = capture_time.getHours();
    }

    $.each(portal.options.details.resonatorArray.resonators, function(ind, reso) {
      if(reso) {
        var decay_days = Math.floor(reso.energyTotal/(RESO_NRG[reso.level]*0.15));

        var now = new Date();
        var today_hours = now.getHours();
        var decay_hours = 0;

        if (today_hours < capture_hours) {
          decay_hours = capture_hours - today_hours;
        } else {
          decay_days -= 1;
          decay_hours = (capture_hours + 23) - today_hours;
        }

        decay_time = decay_days + 'd' + decay_hours + 'h';
        decay_days_high_resolution = decay_days + (decay_hours/24);
        //console.log('Capture time: ' + capture_time + '  Capture hours: ' + capture_hours);
        //console.log('Days: ' + decay_days + '  Hours: ' + decay_hours + '  Total: ' + decay_days_high_resolution);

        resonators[ind] = [reso.level, window.getPlayerName(reso.ownerGuid), reso.distanceToPortal, reso.energyTotal, RESO_NRG[reso.level], decay_time];
        energy += reso.energyTotal;
        maxenergy += RESO_NRG[reso.level];


        if(decay_days_high_resolution > max_days_till_decay) {
          max_days_till_decay = decay_days_high_resolution;
          days_till_decay = decay_time;
        }
      } else { resonators[ind] = [0,'',0,0,0,'n/a']; }
    });
    // Sort resonators array by resonator level
    resonators.sort(function (a, b) {return b[0] - a[0]});

    var thisPortal = {'portal': d,
                      'name': name,
                      'team': team,
                      'level': level,
                      'guid': guid,
                      'resonators': resonators,
                      'energyratio': maxenergy ? Math.floor(energy/maxenergy*100) : 0,
                      'energy': energy,
                      'maxenergy': maxenergy,
                      'lat': portal._latlng.lat,
                      'lng': portal._latlng.lng,
                      'address': address,
                      'img': img,
                      'recharge_needed': maxenergy ? maxenergy - energy : 0,
                      'daily_drain': maxenergy ? Math.floor(maxenergy*0.15) : 0,
                      'days_till_decay': days_till_decay,
                     };
    window.plugin.portal_energy_statistics.listPortals.push(thisPortal);
  });

  return retval;
}

window.plugin.portal_energy_statistics.displayPL = function() {
  // debug tools
  //var start = new Date().getTime();
  //console.log('***** Start ' + start);

  var html = '';
  window.plugin.portal_energy_statistics.sortOrder=-1;
  window.plugin.portal_energy_statistics.enlP = 0;
  window.plugin.portal_energy_statistics.resP = 0;

  if (window.plugin.portal_energy_statistics.getPortals()) {
    html += window.plugin.portal_energy_statistics.portalTable('level', window.plugin.portal_energy_statistics.sortOrder,window.plugin.portal_energy_statistics.filter);
  } else {
    html = '<table><tr><td>Nothing to show!</td></tr></table>';
  };

  dialog({
    html: '<div id="portal_energy_statistics">' + html + '</div>',
    dialogClass: 'ui-dialog-portal_energy_statistics',
    title: 'Portal Energy Statistics: ' + window.plugin.portal_energy_statistics.listPortals.length + ' ' + (window.plugin.portal_energy_statistics.listPortals.length == 1 ? 'portal' : 'portals'),
    id: 'portal-energy-statistics',
    width: 800
  });

  // Setup sorting
  $(document).on('click.portal_energy_statistics', '#portal_energy_statistics table th', function() {
    $('#portal_energy_statistics').html(window.plugin.portal_energy_statistics.portalTable($(this).data('sort'),window.plugin.portal_energy_statistics.sortOrder,window.plugin.portal_energy_statistics.filter));
  });
  $(document).on('click.portal_energy_statistics', '#portal_energy_statistics .filterAll', function() {
    $('#portal_energy_statistics').html(window.plugin.portal_energy_statistics.portalTable($(this).data('sort'),window.plugin.portal_energy_statistics.sortOrder,0));
  });
  $(document).on('click.portal_energy_statistics', '#portal_energy_statistics .filterRes', function() {
    $('#portal_energy_statistics').html(window.plugin.portal_energy_statistics.portalTable($(this).data('sort'),window.plugin.portal_energy_statistics.sortOrder,1));
  });
  $(document).on('click.portal_energy_statistics', '#portal_energy_statistics .filterEnl', function() {
    $('#portal_energy_statistics').html(window.plugin.portal_energy_statistics.portalTable($(this).data('sort'),window.plugin.portal_energy_statistics.sortOrder,2));
  });
  
  //debug tools
  //end = new Date().getTime();
  //console.log('***** end : ' + end + ' and Elapse : ' + (end - start));
 }
    
window.plugin.portal_energy_statistics.portalTable = function(sortBy, sortOrder, filter) {
  // sortOrder <0 ==> desc, >0 ==> asc, i use sortOrder * -1 to change the state
  window.plugin.portal_energy_statistics.filter=filter;
  var portals=window.plugin.portal_energy_statistics.listPortals;

  //Array sort
  window.plugin.portal_energy_statistics.listPortals.sort(function(a, b) {
    var retVal = 0;
    switch (sortBy) {
      case 'names':
        retVal = a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        break;
      case 'r1':
        retVal = b.resonators[0][0] - a.resonators[0][0];
        if (retVal)
          break;
      case 'r2':
        retVal = b.resonators[1][0] - a.resonators[1][0];
        if (retVal)
          break;
      case 'r3':
        retVal = b.resonators[2][0] - a.resonators[2][0];
        if (retVal)
          break;
      case 'r4':
        retVal = b.resonators[3][0] - a.resonators[3][0];
        if (retVal)
          break;
      case 'r5':
        retVal = b.resonators[4][0] - a.resonators[4][0];
        if (retVal)
          break;
      case 'r6':
        retVal = b.resonators[5][0] - a.resonators[5][0];
        if (retVal)
          break;
      case 'r7':
        retVal = b.resonators[6][0] - a.resonators[6][0];
        if (retVal)
          break;
      case 'r8':
        retVal = b.resonators[7][0] - a.resonators[7][0];
        break;
      default:
        retVal = b[sortBy] - a[sortBy];
        break;
    }
    if (sortOrder > 0) retVal = -retVal; //thx @jonatkins
    return retVal;
  });

  var sort = window.plugin.portal_energy_statistics.portalTableSort;
  var html = window.plugin.portal_energy_statistics.stats();
  html += '<table>'
  + '<tr rowspan="2"><th ' + sort('names', sortBy, -1) + '>Portal</th>'
  + '<th ' + sort('level', sortBy, -1) + '>Level</th>'
  + '<th title="Team" ' + sort('team', sortBy, -1) + '>T</th>'
  + '<th ' + sort('r1', sortBy, -1) + '>R1</th>'
  + '<th ' + sort('r2', sortBy, -1) + '>R2</th>'
  + '<th ' + sort('r3', sortBy, -1) + '>R3</th>'
  + '<th ' + sort('r4', sortBy, -1) + '>R4</th>'
  + '<th ' + sort('r5', sortBy, -1) + '>R5</th>'
  + '<th ' + sort('r6', sortBy, -1) + '>R6</th>'
  + '<th ' + sort('r7', sortBy, -1) + '>R7</th>'
  + '<th ' + sort('r8', sortBy, -1) + '>R8</th>'
  + '<th ' + sort('energy', sortBy, -1) + '>Energy</th>'
  + '<th ' + sort('maxenergy', sortBy, -1) + '>Max Energy</th>'
  + '<th ' + sort('energyratio', sortBy, -1) + '>%</th>'
  + '<th ' + sort('rechargeneeded', sortBy, -1) + '>Recharge</th>'
  + '<th ' + sort('dailyneeded', sortBy, -1) + '>Daily Drain</th>'
  + '<th ' + sort('days_till_decay', sortBy, -1) + '>Decay</th>'
  + '</tr>';


  var total_energy = 0;
  var total_maxenergy = 0;
  var total_recharge = 0;
  var total_drain = 0;
  $.each(portals, function(ind, portal) {

    if (filter === 0 || filter === portal.team) {
      html += '<tr class="' + (portal.team === 1 ? 'res' : (portal.team === 2 ? 'enl' : 'neutral')) + '">'
      + '<td style="">' + window.plugin.portal_energy_statistics.getPortalLink(portal.portal, portal.guid) + '</td>'
      + '<td class="L' + Math.floor(portal.level) +'" style="padding: 3px;">' + portal.level + '</td>'
      + '<td style="text-align:center;">' + portal.team + '</td>';

      var title;
      var percent;
      $.each([0, 1, 2, 3 ,4 ,5 ,6 ,7], function(ind, slot) {
        percent = portal.resonators[slot][4] ? Math.floor(portal.resonators[slot][3]/portal.resonators[slot][4]*100) : 0;
        title = 'title="owner: <b>' + portal.resonators[slot][1] + '</b><br/>'
        + 'energy: ' + portal.resonators[slot][3] + ' / ' + portal.resonators[slot][4] + ' (' + percent + '%)<br/>'
        + 'distance: ' + portal.resonators[slot][2] + 'm<br/>'
        + 'decay: ' + portal.resonators[slot][6] + 'days';

        html += '<td class="L' + portal.resonators[slot][0] +'" ' + title + '"><div class="reso-container">'
          + '<div class="reso-level">' + portal.resonators[slot][0] + '</div>'
          + '<div class="energy-bar" style="width: ' + (100-percent) + '%; min-width: ' + (100-percent) + '%; max-width: ' + (100-percent) + '%; left: ' + percent + '%;">&nbsp;</div>'
          + '</div></td>';

      });

      html += ''
      + '<td style="cursor:help" title="'+ portal.energy +'">' + prettyEnergy(portal.energy) + '</td>'
      + '<td style="cursor:help" title="'+ portal.maxenergy +'">' + prettyEnergy(portal.maxenergy) + '</td>'
      + '<td style="cursor:help" title="' + portal.energy + ' / ' + portal.maxenergy +'">' + portal.energyratio + '%</td>'
      + '<td>' + portal.recharge_needed + '</td>'
      + '<td>' + portal.daily_drain + '</td>'
      + '<td>' + portal.days_till_decay + '</td>'
      + '</tr>';
      total_energy += portal.energy;
      total_maxenergy += portal.maxenergy;
      total_recharge += portal.recharge_needed;
      total_drain += portal.daily_drain;
    }
  });
  html += '<tr class="summary"><td colspan="11">&nbsp;</td>'
  + '<td style="cursor:help" title="' + total_energy + '">' + prettyEnergy(total_energy) + '</td>'
  + '<td style="cursor:help" title="' + total_maxenergy + '">' + prettyEnergy(total_maxenergy) + '</td>'
  + '<td>' + (total_maxenergy ? Math.floor(total_energy/total_maxenergy*100): 0) + '%</td>'
  + '<td style="cursor:help" title="' + total_recharge + '">' + prettyEnergy(total_recharge) + '</td>'
  + '<td style="cursor:help" title="' + total_drain + '">' + prettyEnergy(total_drain) + '</td>'
  + '</tr>'
  + '</table>';

  html += '<div class="disclaimer">Click on portals table headers to sort by that column. '
  + 'Click on <b>All Portals, Resistance Portals, Enlightened Portals</b> to filter<br></div>';

  window.plugin.portal_energy_statistics.sortOrder = window.plugin.portal_energy_statistics.sortOrder*-1;
  return html;
}

window.plugin.portal_energy_statistics.stats = function(sortBy) {
  //console.log('** stats');
  var html = '<table><tr>'
  + '<td class="filterAll" style="cursor:pointer"  onclick="window.plugin.portal_energy_statistics.portalTable(\'level\',-1,0)"><a href=""></a>All Portals : (click to filter)</td><td class="filterAll">' + window.plugin.portal_energy_statistics.listPortals.length + '</td>'
  + '<td class="filterRes" style="cursor:pointer" class="sorted" onclick="window.plugin.portal_energy_statistics.portalTable(\'level\',-1,1)">Resistance Portals : </td><td class="filterRes">' + window.plugin.portal_energy_statistics.resP +' (' + Math.floor(window.plugin.portal_energy_statistics.resP/window.plugin.portal_energy_statistics.listPortals.length*100) + '%)</td>' 
  + '<td class="filterEnl" style="cursor:pointer" class="sorted" onclick="window.plugin.portal_energy_statistics.portalTable(\'level\',-1,2)">Enlightened Portals : </td><td class="filterEnl">'+ window.plugin.portal_energy_statistics.enlP +' (' + Math.floor(window.plugin.portal_energy_statistics.enlP/window.plugin.portal_energy_statistics.listPortals.length*100) + '%)</td>'  
  + '</tr>'
  + '</table>';
  return html;
}

// A little helper functon so the above isn't so messy
window.plugin.portal_energy_statistics.portalTableSort = function(name, by) {
  var retVal = 'data-sort="' + name + '"';
  if(name === by) {
    retVal += ' class="sorted"';
  }
  return retVal;
};

// portal link - single click: select portal
//               double click: zoom to and select portal
//               hover: show address
// code from getPortalLink function by xelio from iitc: AP List - https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/plugins/ap-list.user.js
window.plugin.portal_energy_statistics.getPortalLink = function(portal,guid) {

  var latlng = [portal.locationE6.latE6/1E6, portal.locationE6.lngE6/1E6].join();
  var jsSingleClick = 'window.renderPortalDetails(\''+guid+'\');return false';
  var jsDoubleClick = 'window.zoomToAndShowPortal(\''+guid+'\', ['+latlng+']);return false';
  var perma = '/intel?latE6='+portal.locationE6.latE6+'&lngE6='+portal.locationE6.lngE6+'&z=17&pguid='+guid;

  //Use Jquery to create the link, which escape characters in TITLE and ADDRESS of portal
  var a = $('<a>',{
    "class": 'help',
    text: portal.portalV2.descriptiveText.TITLE,
    title: portal.portalV2.descriptiveText.ADDRESS,
    href: perma,
    onClick: jsSingleClick,
    onDblClick: jsDoubleClick
  })[0].outerHTML;
  var div = '<div style="max-height: 15px !important; min-width:140px !important;max-width:180px !important; overflow: hidden; text-overflow:ellipsis;">'+a+'</div>';
  return div;
}

var setup =  function() {
  $('#toolbox').append(' <a onclick="window.plugin.portal_energy_statistics.displayPL()" title="Display a list of portal energy stats in the current view">Energy statistics</a>');
  $('head').append('<style>' +
    //style.css sets dialog max-width to 700px - override that here
    '#dialog-portal_energy_statistics {max-width: 800px !important;}' +
    '#portal_energy_statistics table {margin-top:5px; border-collapse: collapse; empty-cells: show; width:100%; clear: both;}' +
    '#portal_energy_statistics table td, #portal_energy_statistics table th {border-bottom: 1px solid #0b314e; padding:3px; color:white; background-color:#1b415e}' +
    '#portal_energy_statistics table tr.res td {  background-color: #005684; }' +
    '#portal_energy_statistics table tr.enl td {  background-color: #017f01; }' +
    '#portal_energy_statistics table tr.neutral td {  background-color: #000000; }' +
    '#portal_energy_statistics table tr.summary {  padding-top: 0.5em; }' +
    '#portal_energy_statistics table tr.summary td {  background-color: #000000; }' +
    '#portal_energy_statistics table th { text-align:center;}' +
    '#portal_energy_statistics table td { text-align: center;}' +
    '#portal_energy_statistics table td.L0 { cursor: help; background-color: #000000 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L1 { cursor: help; background-color: #FECE5A !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L2 { cursor: help; background-color: #FFA630 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L3 { cursor: help; background-color: #FF7315 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L4 { cursor: help; background-color: #E40000 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L5 { cursor: help; background-color: #FD2992 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L6 { cursor: help; background-color: #EB26CD !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L7 { cursor: help; background-color: #C124E0 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td.L8 { cursor: help; background-color: #9627F4 !important; border: 1px solid white; padding: 0px;}' +
    '#portal_energy_statistics table td:nth-child(1) { text-align: left;}' +
    '#portal_energy_statistics table th { cursor:pointer; text-align: right;}' +
    '#portal_energy_statistics table th:nth-child(1) { text-align: left;}' +
    '#portal_energy_statistics table th.sorted { color:#FFCE00; }' +
    '#portal_energy_statistics .filterAll { margin-top:10px;}' +
    '#portal_energy_statistics .filterRes { margin-top:10px; background-color: #005684  }' +
    '#portal_energy_statistics .filterEnl { margin-top:10px; background-color: #017f01  }' +
    '#portal_energy_statistics .disclaimer { margin-top:10px; font-size:10px; }' +
    '#portal_energy_statistics div { box-sizing: border-box; }' +
    '#portal_energy_statistics .reso-container { box-sizing: border-box; width: 100%; height: 21px; position: relative; }' +
    '#portal_energy_statistics div.reso-level { z-index: 2; position: absolute; width: 100%; left: auto; right: auto; padding: 3px; }' +
    '#portal_energy_statistics div.energy-bar { top: 0; background-color: #000000 !important; position: absolute; z-index: 1; height: 100%; }' +
    '</style>');
}

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
