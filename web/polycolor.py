"""
Filename: polycolor.py
Purpose: Flask web server script, with a request handler
         for creating a Google Maps Directions API polyline
         with weather hazards overlayed as colors, 
         analogous to the traffic colors.
Author: Brandon Taylor
Date: 2019-01-06
Copyright 2019 Brandon Taylor.
"""
import json
import tempfile
import copy
from urllib import urlretrieve
from datetime import datetime, timedelta, tzinfo
import time
import numpy as np
import polyline
import pygrib
from flask import Flask, request
app = Flask(__name__)

NAM_NOMADS_URL = 'https://nomads.ncep.noaa.gov/cgi-bin/'

def nearest_gridpoint(lats, lons, point_lat, point_lon, data):
    """
    Finds the nearest-neighbor in the gridded model data to any 
    arbitrary lat/lon point.
    @param {np.ndarray} lats - 2-D numpy array of grid latitude
    @param {np.ndarray} lons - 2-D numpy array of grid longitude
    @param {float} point_lat - selected point latitude
    @param {float} point_lon - selected point longitude
    @param {tuple} data - contains the model fields accumulated precipitation,
                          2 metre temperature, and percent chance of frozen 
                          precipitation. The fields are 2-D numpy array of same 
                          shape as gridded lats/lons.
    @return {tuple} - contains the nearest gridpoint temperature, precip and percent
                      chance of frozen precip to the selected point.
    """
    abslat = np.abs(lats - point_lat)
    abslon = np.abs(lons - point_lon)
    c = np.maximum(abslon, abslat)
    latlon_idx = np.argmin(c)
    gridpoint_temp = data[0].flat[latlon_idx]
    gridpoint_precip = data[1].flat[latlon_idx]
    gridpoint_frozen_precip = data[2].flat[latlon_idx]
    return (gridpoint_temp, gridpoint_precip, gridpoint_frozen_precip)

def weather_check(temp, precip):
    """
    Does unit conversions and checks for heavy or frozen precip.
    @param {float} temp - temperature in units of Kelvin
    @param {float} precip - precip in units of kg/m^2 (nearly equivalent to mm)
    @return {tuple} - contains the hazard level color (green, orange, or red),
                      and temperature and precipitation converted to celcius and
                      inches, respectively.
    """
    temp = temp - 273
    precip = precip * 0.039
    hazard_level = 'green'
    if precip > 0.02:
        if temp <= 0 or precip > 10:
            hazard_level = 'red'
        else:
            hazard_level = 'orange'
    return (hazard_level, temp, precip)
    
@app.route('/polyline')
def pline():
    """
    This request handler accepts a Google Maps Directions API
    polyline, and checks weather conditions at each point along the
    line. The line is chunked into hour segments, and the model data is
    only downloaded for the subregion that these hour long segments cover.
    Returns a colored polyline, with hazard levels, and other weather 
    conditions embedded within.
    """ 
    encoded_polyline = request.args.get('overview_polyline')
    decoded_polyline = polyline.decode(encoded_polyline)
    polyline_arr = np.asarray(decoded_polyline)
    duration = int(request.args.get('duration')) / 3600
    departure_time = int(request.args.get('departure_time'))
    departure_time = datetime.utcfromtimestamp(departure_time)
    model_init_date = datetime.now()
    if 0 <= model_init_date.hour <= 6:
        model_init_date = model_init_date - timedelta(days=1)
    model_init_hour = 0 if 6 < model_init_date.hour < 18 else 12
    model_init_date = model_init_date.replace(hour=model_init_hour, 
                                              minute=0, second=0)
    divisions = 1 if duration == 0 else duration 
    divided = np.array_split(polyline_arr, divisions)    
    init_hour = model_init_date.strftime('t%Hz')
    init_date = model_init_date.strftime('%Y%m%d')
    prog_hour = abs(int(((departure_time - model_init_date).total_seconds())/ 3600))
    nam_grb_req = ("filter_nam_conusnest.pl?file=nam." + init_hour +
                  ".conusnest.hiresf.tm00.grib2&lev_2_m_above_ground" +
                  "=on&lev_surface=on&var_APCP=on&var_CPOFP=on&var_TMP=on&subregion" +
                  "=&leftlon=&rightlon=&toplat=&bottomlat=&dir=%2Fnam." + init_date)
    start_lat = divided[0][0][0]
    start_lon = divided[0][0][1]
    polylines = []
    previous_point = {'lat':start_lat, 'lng':start_lon}
    print 'Start:', previous_point
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
        raw_grbs = urlretrieve(NAM_NOMADS_URL + nam_grb_req_current, temp_grbs.name)
        grbs = pygrib.open(temp_grbs.name)
        temp = grbs.select(name='2 metre temperature')[0]
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
            if hazard_level in ['orange', 'red', 'green']:
                pline['temp'] = round((human_friendly_temp * (9/5)) + 32)
                pline['precip'] = round(human_friendly_precip, 2)
                pline['frozen_precip'] = int(gridpoint_frozen_precip)
                pline['prog_date_epoch'] = prog_date_epoch
            polylines.append(pline)
            previous_point = {'lat':point[0], 'lng':point[1]}
    print 'End:', previous_point
    return json.dumps(polylines)
            
if __name__ == '__main__':
    app.run()

