
/*
  Gpredict: Real-time satellite tracking and orbit prediction program

  Copyright (C)  2023       David Nemeth Cs, encse.
  Copyright (C)  2001-2017  Alexandru Csete, OZ9AEC.
  Copyright (C)  2006-2007  William J Beksi, KC2EXL.
  Copyright (C)  2013       Charles Suprin,  AA1VS.
 
  This program is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation; either version 2 of the License, or
  (at your option) any later version.
  
  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
  
  You should have received a copy of the GNU General Public License
  along with this program; if not, visit http://www.fsf.org/
*/

const RADIAN = 180.0 / Math.PI;

/* arc length for 1 degree, 60 Nautical Miles */
const ARC_IN_KM = 111.2


/**
 * \brief Calculate the distance and bearing between two points.
 * \param lon1          The local Longitude, decimal degrees
 * \param lat1          The local Latitude, decimal degrees
 * \param lon2          The remote Longitude, decimal degrees
 * \param lat2          The remote Latitude, decimal degrees
 * \param distance     Pointer for the distance, km
 * \param azimuth     Pointer for the bearing, decimal degrees
 *
 *  Calculate the QRB between \a lon1, \a lat1 and \a lon2, \a lat2.
 *
 *     This version will calculate the QRB to a precision sufficient
 *     for 12 character locators.  Antipodal points, which are easily
 *     calculated, are considered equidistant and the bearing is
 *     simply resolved to be true north (0.0).
 *
 * \retval RIG_EINVAL if lat and lon values exceed -90 to 90 or -180 to 180.
 * \retval RIG_OK if calculations are successful.
 *
 * \return The distance in kilometers and azimuth in decimal degrees
 *  for the short path are stored in \a distance and \a azimuth.
 *
 * \sa distance_long_path(), azimuth_long_path()
 */

export function qrb(lon1: number, lat1: number, lon2: number, lat2: number): { res: string, distance: number, azimuth: number } {

    let distance = 0.0;
    let azimuth = 0.0;

    let delta_long, tmp, arc, az;

    if ((lat1 > 90.0 || lat1 < -90.0) || (lat2 > 90.0 || lat2 < -90.0)) {
        return { res: "RIG_EINVAL", distance, azimuth };
    }

    if ((lon1 > 180.0 || lon1 < -180.0) || (lon2 > 180.0 || lon2 < -180.0)) {
        return { res: "RIG_EINVAL", distance, azimuth };
    }

    /* Prevent ACOS() Domain Error */
    if (lat1 == 90.0)
        lat1 = 89.999999999;
    else if (lat1 == -90.0)
        lat1 = -89.999999999;

    if (lat2 == 90.0)
        lat2 = 89.999999999;
    else if (lat2 == -90.0)
        lat2 = -89.999999999;

    /* Convert variables to Radians */
    lat1 /= RADIAN;
    lon1 /= RADIAN;
    lat2 /= RADIAN;
    lon2 /= RADIAN;

    delta_long = lon2 - lon1;

    tmp = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(delta_long);

    if (tmp > .999999999999999) {
        /* Station points coincide, use an Omni! */
        distance = 0.0;
        azimuth = 0.0;
        return { res: "RIG_OK", distance, azimuth };
    }

    if (tmp < -.999999) {
        /*
         * points are antipodal, it's straight down.
         * Station is equal distance in all Azimuths.
         * So take 180 Degrees of arc times 60 nm,
         * and you get 10800 nm, or whatever units...
         */

        distance = 180.0 * ARC_IN_KM;
        azimuth = 0.0;
        return { res: "RIG_OK", distance, azimuth };
    }

    arc = Math.acos(tmp);

    /*
     * One degree of arc is 60 Nautical miles
     * at the surface of the earth, 111.2 km, or 69.1 sm
     * This method is easier than the one in the handbook
     */

    /* Short Path */
    distance = ARC_IN_KM * RADIAN * arc;

    /* This formula seems to work with very small distances
     *
     * I found it on the Web at:
     * http://williams.best.vwh.net/avform.htm#Crs
     *
     * Strangely, all the computed values were negative thus the
     * sign reversal below.
     * - N0NB
     */
    az = Math.atan2(Math.sin(lon1 - lon2) * Math.cos(lat2),
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) *
        Math.cos(lat2) * Math.cos(lon1 - lon2));
    az = az  % 2 * Math.PI;
    az = RADIAN * az;

    if (lon1 > lon2) {
        az -= 360.;
        azimuth = -az;
    } else if (az >= 0.0) {
        azimuth = az;
    } else {
        azimuth = -az;
    }

    return { res: "RIG_OK", distance, azimuth };
}
