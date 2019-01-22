import sys
import numpy as np
import haversine
import polyline
import pygrib
import json
import subprocess
import requests
import tempfile
import copy
from urllib import urlretrieve
from datetime import datetime, timedelta, tzinfo
import time
from flask import Flask, request
app = Flask(__name__)

nam_nomads_url = 'http://nomads.ncep.noaa.gov/cgi-bin/'

def nearest_gridpoint(lats, lons, point_lat, point_lon, data):
    abslat = np.abs(lats - point_lat)
    abslon = np.abs(lons - point_lon)
    c = np.maximum(abslon,abslat)
    latlon_idx = np.argmin(c)
    gridpoint_temp = data[0].flat[latlon_idx]
    gridpoint_precip = data[1].flat[latlon_idx]
    gridpoint_frozen_precip = data[2].flat[latlon_idx]
    return (gridpoint_temp, gridpoint_precip, gridpoint_frozen_precip)

def weather_check(temp, precip):
    temp = temp - 273
    precip = precip * 0.039
    hazard_level = 'green'
    if precip > 0.02:
        if temp <= 0 or precip > 10:
            hazard_level = 'red'
        else:
            hazard_level = 'yellow'
    return (hazard_level, temp, precip)
    
@app.route('/polyline')
def pline():
    encoded_polyline = request.args.get('overview_polyline')
    decoded_polyline = polyline.decode(encoded_polyline)
    polyline_arr = np.asarray(decoded_polyline)
    duration = int(request.args.get('duration')) / 3600
    departure_time = int(request.args.get('departure_time'))
    departure_time = datetime.utcfromtimestamp(departure_time)
    model_init_date = datetime.now()
    if 0 < model_init_date.hour < 6:
        model_init_date = model_init_date - timedelta(days=1)
    model_init_hour = 0 if 6 < model_init_date.hour < 18 else 12
    print model_init_hour, departure_time.hour
    model_init_date = model_init_date.replace(hour=model_init_hour, minute=0, second=0)
    divisions = 1 if duration == 0 else duration 
    divided = np.array_split(polyline_arr, divisions)    
    init_hour = model_init_date.strftime('t%Hz')
    init_date = model_init_date.strftime('%Y%m%d')
    print init_date
    prog_hour = round((departure_time - model_init_date).seconds / 3600.)
    nam_grb_req = "filter_nam_conusnest.pl?file=nam."+init_hour+".conusnest.hiresf.tm00.grib2&lev_2_m_above_ground=on&lev_surface=on&var_APCP=on&&var_CPOFP=on&var_TMP=on&subregion=&leftlon=&rightlon=&toplat=&bottomlat=&dir=%2Fnam."+init_date
    start_lat = divided[0][0][0]
    start_lon = divided[0][0][1]
    polylines = []
    #previous_polyline = {'coords':[{'lat':start_lat, 'lng':start_lon}]}
    #polyline_template = {'coords':[{'lat':start_lat, 'lng':start_lon}]}
    previous_point = {'lat':start_lat, 'lng':start_lon}
    previous_hazard_level = None
    prog_hour_iterate = 0
    for chunk in divided:
        lat_start = chunk[0][0] 
        lat_end = chunk[-1][0]
        lon_start = chunk[0][1]
        lon_end = chunk[-1][1]
        lat_n = (lat_start if lat_start > lat_end else lat_end) + 0.1
        lat_s = (lat_end if lat_end < lat_start else lat_start) - 0.1
        lon_w = (lon_start if lon_start < lon_end else lon_end) - 0.2
        lon_e = (lon_end if lon_end > lon_start else lon_start) + 0.2
        nam_grb_req_current = nam_grb_req.replace('leftlon=','leftlon='+ '%f' % lon_w)
        nam_grb_req_current = nam_grb_req_current.replace('rightlon=','rightlon='+ '%f' % lon_e)
        nam_grb_req_current = nam_grb_req_current.replace('toplat=','toplat='+ '%f' % lat_n)
        nam_grb_req_current = nam_grb_req_current.replace('bottomlat=','bottomlat='+ '%f' % lat_s)
        prog_hour_current = prog_hour + prog_hour_iterate
        prog_hour_str = '%02d' % prog_hour_current
        prog_date = model_init_date + timedelta(hours=prog_hour_current)
        prog_date_epoch = time.mktime(prog_date.timetuple())
        prog_hour_iterate += 1
        nam_grb_req_current = nam_grb_req_current.replace('resf', 'resf'+prog_hour_str)
        print nam_grb_req_current
        temp_grbs = tempfile.NamedTemporaryFile()
        raw_grbs = urlretrieve(nam_nomads_url + nam_grb_req_current, temp_grbs.name)
        #raw_grbs = urlretrieve(nam_nomads_url + nam_grb_req_current, '/home/btaylor/routewx/grib_sample_data/'+nam_grb_req_current)
        #print raw_grbs
        #continue
        grbs = pygrib.open(temp_grbs.name)
        #grbs = pygrib.open('/home/btaylor/routewx/grib_sample_data/'+nam_grb_req_current)
        #for grb in grbs:
        #    print grb
        temp = grbs.select(name='2 metre temperature')[0]
        temp.values = temp.values
        precip = grbs.select(name='Total Precipitation')[0]
        frozen_precip = grbs.select(name='Percent frozen precipitation')[0]
        lats, lons = temp.latlons()
        for point in chunk:
            (gridpoint_temp, gridpoint_precip, 
            gridpoint_frozen_precip) = nearest_gridpoint(lats, 
            lons, point[0], point[1], (temp.values, precip.values, frozen_precip.values))
            (hazard_level, human_friendly_temp, 
            human_friendly_precip) = weather_check(gridpoint_temp, gridpoint_precip)
            pline = {}
            pline['hazard_level'] = hazard_level
            pline['coords'] = [previous_point, {'lat':point[0], 'lng':point[1]}]
            if hazard_level in ['yellow', 'red']:
                pline['temp'] = round((human_friendly_temp * (9/5)) + 32)
                pline['precip'] = round(human_friendly_precip, 2)
                pline['frozen_precip'] = abs(int(gridpoint_frozen_precip))
                pline['prog_date_epoch'] = prog_date_epoch
            polylines.append(pline)
            previous_point = {'lat':point[0], 'lng':point[1]}
    return json.dumps(polylines)
            
if __name__ == '__main__':
    app.run()

