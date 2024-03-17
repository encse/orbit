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

import { qrb } from "./locator";

const de2ra = Math.PI / 180;
const xkmper =  6.378135E3     /* Earth radius km */

export type Sat = {
    ssplat: number
    ssplon: number
    footprint: number
}

export type SatMap = {
    left_side_lon: number
    width: number
    height: number
    x0: number
    y0: number
}

type XY = { x: number, y: number }

/**
 * Calculate satellite footprint and coverage area.
 *
 * @param satmap TheGtkSatMap widget.
 * @param sat The satellite.
 * @param points1 Initialised GooCanvasPoints structure with 360 points.
 * @param points2 Initialised GooCanvasPoints structure with 360 points.
 * @return The number of range circle parts.
 *
 * This function calculates the "left" side of the range circle and mirrors
 * the points in longitude to create the "right side of the range circle, too.
 * In order to be able to use the footprint points to create a set of subsequent
 * lines connected to each other (poly-lines) the function may have to perform
 * one of the following three actions:
 *
 * 1. If the footprint covers the North or South pole, we need to sort the points
 *    and add two extra points: One to begin the range circle (e.g. -180,90) and
 *    one to end the range circle (e.g. 180,90). This is necessary to create a
 *    complete and consistent set of points suitable for a polyline. The addition
 *    of the extra points is done by the sort_points function.
 *
 * 2. Else if parts of the range circle is on one side of the map, while parts of
 *    it is on the right side of the map, i.e. the range circle runs off the border
 *    of the map, it calls the split_points function to split the points into two
 *    complete and consistent sets of points that are suitable to create two 
 *    poly-lines.
 *
 * 3. Else nothing needs to be done since the points are already suitable for
 *    a polyline.
 *
 * The function will re-initialise points1 and points2 according to its needs. The
 * total number of points will always be 360, even with the addition of the two
 * extra points. 
 */
export function calculate_footprint(satmap: SatMap, sat: Sat): [XY[], XY[]] {
    let azi;
    let sx, sy, msx, msy, ssx, ssy;
    let ssplat, ssplon, beta, azimuth, num, dem;
    let rangelon, rangelat, mlon;
    let warpedT = false;
    let warped = false;

    let points1 = goo_canvas_points_new(360);
    let points2: XY[] = [];

    /* Range circle calculations.
     * Borrowed from gsat 0.9.0 by Xavier Crehueras, EB3CZS
     * who borrowed from John Magliacane, KD2BD.
     * Optimized by Alexandru Csete and William J Beksi.
     */
    ssplat = sat.ssplat * de2ra;
    ssplon = sat.ssplon * de2ra;
    beta = (0.5 * sat.footprint) / xkmper;

    for (azi = 0; azi < 180; azi++) {
        azimuth = de2ra * azi;
        rangelat = Math.asin(Math.sin(ssplat) * Math.cos(beta) + Math.cos(azimuth) * Math.sin(beta) * Math.cos(ssplat));
        num = Math.cos(beta) - (Math.sin(ssplat) * Math.sin(rangelat));
        dem = Math.cos(ssplat) * Math.cos(rangelat);

        if (azi == 0 && north_pole_is_covered(sat))
            rangelon = ssplon + Math.PI;
        else if (Math.abs(num / dem) > 1.0)
            rangelon = ssplon;
        else {
            if ((180.0 - azi) >= 0)
                rangelon = ssplon - arccos(num, dem);
            else
                rangelon = ssplon + arccos(num, dem);
        }

        while (rangelon < -Math.PI) {
            rangelon += Math.PI * 2;
        }

        while (rangelon > Math.PI) {
            rangelon -= Math.PI * 2;
        }

        rangelat = rangelat / de2ra;
        rangelon = rangelon / de2ra;

        /* mirror longitude */
        [warpedT, mlon] = mirror_lon(sat, rangelon, satmap.left_side_lon);
        warped = warped || warpedT;

        [sx, sy] = lonlat_to_xy(satmap, rangelon, rangelat);
        [msx, msy] = lonlat_to_xy(satmap, mlon, rangelat);

        points1[azi] = { x: sx, y: sy };

        /* Add mirrored point */
        points1[359 - azi] = { x: msx, y: msy };
    }

    /* points1 now contains 360 pairs of map-based XY coordinates.
       Check whether actions 1, 2 or 3 have to be performed.
     */

    // console.log("alma", lonlat_to_xy(satmap, -160, 0), lonlat_to_xy(satmap, 160, 0))
    if (pole_is_covered(sat)) {
        /* pole is covered => sort points1 and add additional points */
        sort_points_x(satmap, sat, points1);
    } else if (warped) {
        /* pole not covered but range circle has been warped => split points */
        console.log("WARPED");
        [ssx, ssy] = lonlat_to_xy(satmap, sat.ssplon, sat.ssplat);
        [points1, points2] = split_points(satmap, sat, ssx, points1);
    }
    else {
        /* the nominal condition => points1 is adequate */
    }

    return [points1, points2];
}

/* Check whether the footprint covers the North or South pole. */
function pole_is_covered(sat: Sat) {
    return north_pole_is_covered(sat) || south_pole_is_covered(sat);
}

/* Check whether the footprint covers the North pole. */
function north_pole_is_covered(sat: Sat) {
    let res = qrb(sat.ssplon, sat.ssplat, 0.0, 90.0);
    if (res.res != "RIG_OK") {
        console.error("Bad data measuring distance to North Pole", sat.ssplon, sat.ssplat);
    }
    return res.distance <= 0.5 * sat.footprint;
}

/* Check whether the footprint covers the South pole. */
function south_pole_is_covered(sat: Sat) {
    let res = qrb(sat.ssplon, sat.ssplat, 0.0, -90.0);
    if (res.res != "RIG_OK") {
        console.error("Bad data measuring distance to South Pole", sat.ssplon, sat.ssplat);
    }
    return res.distance <= 0.5 * sat.footprint;
}

function arccos(x: number, y: number) {
    if (x != 0 && y != 0) {
        if (y > 0.0)
            return Math.acos(x / y);
        else if (y < 0.0)
            return Math.PI + Math.acos(x / y);
    }
    return 0.0;
}

/* Assumes that -180 <= lon <= 180 and -90 <= lat <= 90 */
function lonlat_to_xy(p: SatMap, lon: number, lat: number): [number, number] {
    let x = p.x0 + (lon - p.left_side_lon) * p.width / 360.0;
    let y = p.y0 + (90.0 - lat) * p.height / 180.0;
    while (x < 0) {
        x += p.width;
    }
    while (x > p.width) {
        x -= p.width;
    }
    return [x, y]
}

/**
 * Sort points according to X coordinates.
 *
 * @param satmap The GtkSatMap structure.
 * @param sat The satellite data structure.
 * @param points The points to sort.
 * @param num The number of points. By specifying it as parameter we can
 *            sort incomplete arrays.
 *
 * This function sorts the points in ascending order with respect
 * to their x value. After sorting the function adds two extra points
 * to the array using the following algorithms:
 *
 *   move point at position 0 to position 1
 *   move point at position N to position N-1
 *   if (ssplat > 0)
 *         insert (x0,y0) into position 0
 *         insert (x0+width,y0) into position N
 *   else
 *         insert (x0,y0+height) into position 0
 *         insert (x0+width,y0+height) into position N
 *
 * This way we loose the points at position 1 and N-1, but that does not
 * make any big difference anyway, since we have 360 points in total.
 *
 */
function sort_points_x(satmap: SatMap, sat: Sat, points: XY[]) {

    /* call g_qsort_with_data, which warps the qsort function from stdlib */
    points.sort(compare_coordinates_x)

    /* move point at position 0 to position 1 */
    points[1] = { x: satmap.x0, y: points[0].y };

    /* move point at position N to position N-1 */
    points[points.length - 2].x = satmap.x0 + satmap.width;
    points[points.length - 2].y = points[points.length - 1].y;

    if (sat.ssplat > 0.0) {
        /* insert (x0-1,y0) into position 0 */
        points[0].x = satmap.x0;
        points[0].y = satmap.y0;

        /* insert (x0+width,y0) into position N */
        points[points.length - 1].x = satmap.x0 + satmap.width;
        points[points.length - 1].y = satmap.y0;
    }
    else {
        /* insert (x0,y0+height) into position 0 */
        points[0].x = satmap.x0;
        points[0].y = satmap.y0 + satmap.height;

        /* insert (x0+width,y0+height) into position N */
        points[points.length - 1].x = satmap.x0 + satmap.width;
        points[points.length - 1].y = satmap.y0 + satmap.height;
    }
}

/**
 * Sort points according to Y coordinates.
 *
 * @param satmap The GtkSatMap structure.
 * @param sat The satellite data structure.
 * @param points The points to sort.
 *
 * This function sorts the points in ascending order with respect
 * to their y value.
 */
function sort_points_y(satmap: SatMap, sat: Sat, points: XY[]) {
    points.sort(compare_coordinates_y);
}

/* Mirror the footprint longitude. */
function mirror_lon(sat: Sat, rangelon: number, mapbreak: number): [boolean, number] {
    let diff;
    let warped = false;

    /* make it so rangelon is on left of ssplon */
    diff = (sat.ssplon - rangelon);
    while (diff < 0)
        diff += 360;
    while (diff > 360)
        diff -= 360;

    let mlon = sat.ssplon + Math.abs(diff);
    while (mlon > 180) {
        mlon -= 360;
    }
    while (mlon < -180) {
        mlon += 360;
    }
    //printf("Something %s %f %f %f\n",sat->nickname, sat->ssplon, rangelon,mapbreak);
    if (((sat.ssplon >= mapbreak) && (sat.ssplon < mapbreak + 180)) ||
        ((sat.ssplon < mapbreak - 180) && (sat.ssplon >= mapbreak - 360))) {
        if (((rangelon >= mapbreak) && (rangelon < mapbreak + 180)) ||
            ((rangelon < mapbreak - 180) && (rangelon >= mapbreak - 360))) {
        }
        else {
            warped = true;
            //printf ("sat %s warped for first \n",sat->nickname);
        }
    }
    else {
        if (((mlon >= mapbreak) && (mlon < mapbreak + 180)) ||
            ((mlon < mapbreak - 180) && (mlon >= mapbreak - 360))) {
            warped = true;
            //printf ("sat %s warped for second \n",sat->nickname);
        }
    }

    return [warped, mlon];
}

/**
 * Compare two X coordinates.
 */
function compare_coordinates_x(a: XY, b: XY): number {
    return a.x - b.x;
}

/**
 * Compare two Y coordinates.
 */
function compare_coordinates_y(a: XY, b: XY): number {
    return a.y - b.y;
}

/**
 * Split and sort polyline points.
 *
 * @param satmap The GtkSatMap structure.
 * @param points1 GooCanvasPoints containing the footprint points.
 * @param points2 A GooCanvasPoints structure containing the second set of points.
 * @param sspx Canvas based x-coordinate of SSP.
 * @bug We should ensure that the endpoints in points1 have x=x0, while in
 *      the endpoints in points2 should have x=x0+width (TBC).
 *
 * @note This function works on canvas-based coordinates rather than lat/lon
 * @note DO NOT USE this function when the footprint covers one of the poles
 *       (the end result may freeze the X-server requiring a hard-reset!)
 */
function split_points(satmap: SatMap, sat: Sat, sspx: number, points1: XY[]): [XY[], XY[]] {
    /* initialize parameters */
    let n = points1.length;
    let n1 = 0;
    let n2 = 0;
    let i = 0;
    let j = 0;
    let k = 0;
    let ns = 0;
    let tps1: XY[] = [];
    let tps2: XY[] = [];

    //if ((sspx >= (satmap->x0 + satmap->width - 0.6)) ||
    //    (sspx >= (satmap->x0 - 0.6))) {
    //if ((sspx == (satmap->x0 + satmap->width)) ||
    //    (sspx == (satmap->x0))) {
    if ((sat.ssplon >= 179.4) || (sat.ssplon <= -179.4)) {
        console.log('split 1')
        /* sslon = +/-180 deg.
           - copy points with (x > satmap->x0+satmap->width/2) to tps1
           - copy points with (x < satmap->x0+satmap->width/2) to tps2
           - sort tps1 and tps2
         */
        for (i = 0; i < n; i++) {
            if (points1[i].x > (satmap.x0 + satmap.width / 2)) {
                tps1.push(points1[i]);
                n1++;
            }
            else {
                tps2.push(points1[i]);
                n2++;
            }
        }

        sort_points_y(satmap, sat, tps1);
        sort_points_y(satmap, sat, tps2);
    }
    else if (sspx < (satmap.x0 + satmap.width / 2)) {
        console.log('split 2')
        /* We are on the left side of the map.
           Scan through points1 until we get to x > sspx (i=ns):

           - copy the points forwards until x < (x0+w/2) => tps2
           - continue to copy until the end => tps1
           - copy the points from i=0 to i=ns => tps1.

           Copy tps1 => points1 and tps2 => points2
         */
        while (points1[i].x <= (satmap.x0 + satmap.width / 2)) {
            i++;
        }
        ns = i - 1;

        while (points1[i].x > (satmap.x0 + satmap.width / 2)) {
            tps2.push(points1[i]);
            i++;
            j++;
            n2++;
        }

        while (i < n) {
            tps1.push(points1[i]);
            i++;
            k++;
            n1++;
        }

        for (i = 0; i <= ns; i++) {
            tps1.push(points1[i]);
            k++;
            n1++;
        }
    }
    else {
        console.log('split 3')
        /* We are on the right side of the map.
           Scan backwards through points1 until x < sspx (i=ns):

           - copy the points i=ns,i-- until x >= x0+w/2  => tps2
           - copy the points until we reach i=0          => tps1
           - copy the points from i=n to i=ns            => tps1

         */
        i = n - 1;
        while (points1[i].x >= (satmap.x0 + satmap.width / 2)) {
            i--;
        }
        ns = i + 1;

        while (points1[i].x < (satmap.x0 + satmap.width / 2)) {
            tps2.push(points1[i]);
            i--;
            j++;
            n2++;
        }

        while (i >= 0) {
            tps1.push(points1[i]);
            i--;
            k++;
            n1++;
        }

        for (i = n - 1; i >= ns; i--) {
            tps1.push(points1[i]);
            k++;
            n1++;
        }
    }

    //g_print ("NS:%d  N1:%d  N2:%d\n", ns, n1, n2);

    /* free points and copy new contents */
    points1 = tps1.slice(0, n1);
    let points2 = tps2.slice(0, n2);

    /* stretch end points to map borders */
    if (points1[0].x > (satmap.x0 + satmap.width / 2)) {
        points1[0].x = satmap.x0 + satmap.width;
        points1[n1 - 1].x = satmap.x0 + satmap.width;
        points2[0].x = satmap.x0;
        points2[n2 - 1].x = satmap.x0;
    }
    else {
        points2[0].x = satmap.x0 + satmap.width;
        points2[n2 - 1].x = satmap.x0 + satmap.width;
        points1[0].x = satmap.x0;
        points1[n1 - 1].x = satmap.x0;
    }

    return [points1, points2];
}

function goo_canvas_points_new(n: number) {
    return Array.from({ length: n }, () => { return { x: 0, y: 0 }; });
}
