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
from scipy.interpolate import RegularGridInterpolator
from urllib import urlretrieve
from datetime import datetime, timedelta, tzinfo
from mpl_toolkits.basemap import shiftgrid

from flask import Flask, request
from flask_cors import CORS
app = Flask(__name__)
CORS(app)

nam_nomads_url = 'http://nomads.ncep.noaa.gov/cgi-bin/'

class UTC(tzinfo):
    def utcoffset(self, dt):
        return timedelta(0)
    def tzname(self, dt):
        return "UTC"
    def dst(self, dt):
        return timedelta(0)

tz = UTC()
departure_time = datetime(2019, 1, 17, 13, 30, 31, tzinfo=tz)
if 0 < departure_time.hour < 6:
    model_init_date = departure_time - timedelta(days=1)
else:
    model_init_date = departure_time

model_init_hour = 0 if 6 < departure_time.hour < 18 else 12
model_init_date = model_init_date.replace(hour=model_init_hour, minute=0, second=0)

def build_hrrr_request_uri():
    # Placeholder for now
    return None

def shrink_grib(lon_w, lon_e, lat_s, lat_n):
    lons = str(lon_w)+":"+str(lon_e)
    lats = str(lat_s)+":"+str(lat_n)
    code = subprocess.call(["wgrib2","018","-small_grib", lons, lats, "out_shrink.grib2"])
    return code

#@app.route('/poly_color', methods=['POST'])
def poly_color():
    response = request.get_json()
    print response

def nearest_gridpoint(lats, lons, point_lat, point_lon, data):
    abslat = np.abs(lats - point_lat)
    abslon = np.abs(lons - point_lon)
    c = np.maximum(abslon,abslat)
    latlon_idx = np.argmin(c)
    gridpoint_temp = data[0].flat[latlon_idx]
    gridpoint_precip = data[1].flat[latlon_idx]
    return (gridpoint_temp, gridpoint_precip)

def weather_check(temp, precip):
    temp = temp - 273
    precip = precip * 0.039
    hazard_level = 'green'
    if precip > 0.01:
        if temp <= 0 or precip > 10:
            hazard_level = 'red'
        else:
            hazard_level = 'yellow'
    return hazard_level
        
    
#app.run()
@app.route('/polyline')
def pline():
    encoded_polyline = request.args.get('overview_polyline')
    decoded_polyline = polyline.decode(encoded_polyline)
    polyline_arr = np.asarray(decoded_polyline)
    duration = int(request.args.get('duration')) / 3600
    print duration
    divisions = 1 if duration == 0 else duration 
    divided = np.array_split(polyline_arr, divisions)    
    init_hour = model_init_date.strftime('t%Hz')
    init_date = model_init_date.strftime('%Y%m%d')
    prog_hour = round((departure_time - model_init_date).seconds / 3600.)
    nam_grb_req = "filter_nam_conusnest.pl?file=nam."+init_hour+".conusnest.hiresf.tm00.grib2&lev_2_m_above_ground=on&lev_surface=on&var_APCP=on&var_TMP=on&subregion=&leftlon=&rightlon=&toplat=&bottomlat=&dir=%2Fnam."+init_date
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
        prog_hour_str = '%02d' % (prog_hour + prog_hour_iterate)
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
        lats, lons = temp.latlons()
    #    last_point = chunk[-1]
    #    print last_point
        for point in chunk:
            gridpoint_temp, gridpoint_precip = nearest_gridpoint(lats, lons, point[0], point[1], (temp.values, precip.values))
            hazard_level = weather_check(gridpoint_temp, gridpoint_precip)
            pline = {}
            pline['hazard_level'] = hazard_level
            pline['coords'] = [previous_point, {'lat':point[0], 'lng':point[1]}]
            polylines.append(pline)
            previous_point = {'lat':point[0], 'lng':point[1]}
            #print hazard_level
            #if not previous_polyline.get('hazard_level'):
            #    previous_polyline['hazard_level'] = hazard_level
            #    previous_hazard_level = hazard_level
            #if (previous_hazard_level != hazard_level): # or np.array_equal(point, last_point):
                #previous_polyline['coords'].append({'lat':point[0], 'lng':point[1]})
                #current_polyline = copy.copy(previous_polyline)
                #polylines.append(current_polyline)
                #previous_polyline['hazard_level'] = hazard_level
                #previous_polyline['coords'] = [{'lat':point[0], 'lng':point[1]}]
                #previous_hazard_level = hazard_level
    return json.dumps(polylines)
            

app.run()
