/* Live weather-hazard signals for the India tracker: heat, air quality, drought, landslide and severe
   thunderstorm, pulled client-side from Open-Meteo (free, no key). Each point carries its state so the
   tracker can filter without a server lookup. Returns a flat list of tracker "signals". Isolated from the
   map (world.js) on purpose - this file only feeds /status. */
(function () {
  var CITIES = [
    { n: 'Delhi', lat: 28.61, lng: 77.21, s: 'Delhi' }, { n: 'Mumbai', lat: 19.07, lng: 72.87, s: 'Maharashtra' },
    { n: 'Kolkata', lat: 22.57, lng: 88.36, s: 'West Bengal' }, { n: 'Chennai', lat: 13.08, lng: 80.27, s: 'Tamil Nadu' },
    { n: 'Bengaluru', lat: 12.97, lng: 77.59, s: 'Karnataka' }, { n: 'Hyderabad', lat: 17.38, lng: 78.48, s: 'Telangana' },
    { n: 'Ahmedabad', lat: 23.02, lng: 72.57, s: 'Gujarat' }, { n: 'Pune', lat: 18.52, lng: 73.85, s: 'Maharashtra' },
    { n: 'Jaipur', lat: 26.91, lng: 75.79, s: 'Rajasthan' }, { n: 'Lucknow', lat: 26.85, lng: 80.95, s: 'Uttar Pradesh' },
    { n: 'Kanpur', lat: 26.45, lng: 80.33, s: 'Uttar Pradesh' }, { n: 'Nagpur', lat: 21.15, lng: 79.09, s: 'Maharashtra' },
    { n: 'Patna', lat: 25.59, lng: 85.14, s: 'Bihar' }, { n: 'Indore', lat: 22.72, lng: 75.86, s: 'Madhya Pradesh' },
    { n: 'Bhopal', lat: 23.26, lng: 77.41, s: 'Madhya Pradesh' }, { n: 'Prayagraj', lat: 25.44, lng: 81.85, s: 'Uttar Pradesh' },
    { n: 'Agra', lat: 27.18, lng: 78.01, s: 'Uttar Pradesh' }, { n: 'Varanasi', lat: 25.32, lng: 82.97, s: 'Uttar Pradesh' },
    { n: 'Ranchi', lat: 23.34, lng: 85.31, s: 'Jharkhand' }, { n: 'Raipur', lat: 21.25, lng: 81.63, s: 'Chhattisgarh' },
    { n: 'Guwahati', lat: 26.14, lng: 91.74, s: 'Assam' }, { n: 'Bhubaneswar', lat: 20.30, lng: 85.82, s: 'Odisha' },
    { n: 'Visakhapatnam', lat: 17.69, lng: 83.22, s: 'Andhra Pradesh' }, { n: 'Vijayawada', lat: 16.51, lng: 80.65, s: 'Andhra Pradesh' },
    { n: 'Coimbatore', lat: 11.02, lng: 76.96, s: 'Tamil Nadu' }, { n: 'Madurai', lat: 9.93, lng: 78.12, s: 'Tamil Nadu' },
    { n: 'Kochi', lat: 9.93, lng: 76.27, s: 'Kerala' }, { n: 'Amritsar', lat: 31.63, lng: 74.87, s: 'Punjab' },
    { n: 'Ludhiana', lat: 30.90, lng: 75.86, s: 'Punjab' }, { n: 'Jodhpur', lat: 26.24, lng: 73.02, s: 'Rajasthan' },
    { n: 'Bikaner', lat: 28.02, lng: 73.31, s: 'Rajasthan' }, { n: 'Gwalior', lat: 26.22, lng: 78.18, s: 'Madhya Pradesh' },
    { n: 'Jabalpur', lat: 23.18, lng: 79.99, s: 'Madhya Pradesh' }, { n: 'Surat', lat: 21.17, lng: 72.83, s: 'Gujarat' },
    { n: 'Nashik', lat: 19.99, lng: 73.79, s: 'Maharashtra' }, { n: 'Srinagar', lat: 34.08, lng: 74.80, s: 'Jammu and Kashmir' },
  ];
  var DROUGHT = [
    { n: 'Aurangabad', lat: 19.88, lng: 75.34, s: 'Maharashtra' }, { n: 'Beed', lat: 18.99, lng: 75.76, s: 'Maharashtra' },
    { n: 'Latur', lat: 18.40, lng: 76.58, s: 'Maharashtra' }, { n: 'Osmanabad', lat: 18.19, lng: 76.04, s: 'Maharashtra' },
    { n: 'Amravati', lat: 20.93, lng: 77.75, s: 'Maharashtra' }, { n: 'Yavatmal', lat: 20.39, lng: 78.13, s: 'Maharashtra' },
    { n: 'Kalaburagi', lat: 17.33, lng: 76.83, s: 'Karnataka' }, { n: 'Vijayapura', lat: 16.83, lng: 75.71, s: 'Karnataka' },
    { n: 'Ballari', lat: 15.14, lng: 76.92, s: 'Karnataka' }, { n: 'Raichur', lat: 16.20, lng: 77.36, s: 'Karnataka' },
    { n: 'Anantapur', lat: 14.68, lng: 77.60, s: 'Andhra Pradesh' }, { n: 'Kurnool', lat: 15.83, lng: 78.04, s: 'Andhra Pradesh' },
    { n: 'Kadapa', lat: 14.47, lng: 78.82, s: 'Andhra Pradesh' }, { n: 'Mahbubnagar', lat: 16.74, lng: 78.00, s: 'Telangana' },
    { n: 'Nalgonda', lat: 17.05, lng: 79.27, s: 'Telangana' }, { n: 'Jhansi', lat: 25.45, lng: 78.57, s: 'Uttar Pradesh' },
    { n: 'Banda', lat: 25.48, lng: 80.34, s: 'Uttar Pradesh' }, { n: 'Chhatarpur', lat: 24.92, lng: 79.59, s: 'Madhya Pradesh' },
    { n: 'Tikamgarh', lat: 24.74, lng: 78.83, s: 'Madhya Pradesh' }, { n: 'Bhawanipatna', lat: 19.91, lng: 83.16, s: 'Odisha' },
    { n: 'Bolangir', lat: 20.71, lng: 83.48, s: 'Odisha' }, { n: 'Rajkot', lat: 22.30, lng: 70.80, s: 'Gujarat' },
    { n: 'Bhuj', lat: 23.25, lng: 69.67, s: 'Gujarat' }, { n: 'Jamnagar', lat: 22.47, lng: 70.06, s: 'Gujarat' },
    { n: 'Barmer', lat: 25.75, lng: 71.39, s: 'Rajasthan' }, { n: 'Jaisalmer', lat: 26.92, lng: 70.92, s: 'Rajasthan' },
    { n: 'Nagaur', lat: 27.20, lng: 73.73, s: 'Rajasthan' }, { n: 'Ramanathapuram', lat: 9.37, lng: 78.83, s: 'Tamil Nadu' },
    { n: 'Thoothukudi', lat: 8.76, lng: 78.13, s: 'Tamil Nadu' },
  ];
  var LANDSLIDE = [
    { n: 'Chamoli', lat: 30.40, lng: 79.32, s: 'Uttarakhand' }, { n: 'Rudraprayag', lat: 30.28, lng: 78.98, s: 'Uttarakhand' },
    { n: 'Uttarkashi', lat: 30.73, lng: 78.45, s: 'Uttarakhand' }, { n: 'Tehri', lat: 30.38, lng: 78.48, s: 'Uttarakhand' },
    { n: 'Pithoragarh', lat: 29.58, lng: 80.22, s: 'Uttarakhand' }, { n: 'Nainital', lat: 29.38, lng: 79.45, s: 'Uttarakhand' },
    { n: 'Shimla', lat: 31.10, lng: 77.17, s: 'Himachal Pradesh' }, { n: 'Kullu', lat: 31.96, lng: 77.11, s: 'Himachal Pradesh' },
    { n: 'Mandi', lat: 31.71, lng: 76.93, s: 'Himachal Pradesh' }, { n: 'Chamba', lat: 32.56, lng: 76.13, s: 'Himachal Pradesh' },
    { n: 'Kinnaur', lat: 31.58, lng: 78.27, s: 'Himachal Pradesh' }, { n: 'Ramban', lat: 33.24, lng: 75.24, s: 'Jammu and Kashmir' },
    { n: 'Doda', lat: 33.15, lng: 75.55, s: 'Jammu and Kashmir' }, { n: 'Poonch', lat: 33.77, lng: 74.09, s: 'Jammu and Kashmir' },
    { n: 'Gangtok', lat: 27.33, lng: 88.61, s: 'Sikkim' }, { n: 'Darjeeling', lat: 27.04, lng: 88.26, s: 'West Bengal' },
    { n: 'Kalimpong', lat: 27.06, lng: 88.47, s: 'West Bengal' }, { n: 'Aizawl', lat: 23.73, lng: 92.72, s: 'Mizoram' },
    { n: 'Kohima', lat: 25.67, lng: 94.11, s: 'Nagaland' }, { n: 'Imphal', lat: 24.82, lng: 93.94, s: 'Manipur' },
    { n: 'Shillong', lat: 25.57, lng: 91.88, s: 'Meghalaya' }, { n: 'Dima Hasao', lat: 25.18, lng: 93.02, s: 'Assam' },
    { n: 'Wayanad', lat: 11.61, lng: 76.08, s: 'Kerala' }, { n: 'Idukki', lat: 9.85, lng: 76.97, s: 'Kerala' },
    { n: 'Kodagu', lat: 12.42, lng: 75.74, s: 'Karnataka' }, { n: 'Nilgiris', lat: 11.41, lng: 76.70, s: 'Tamil Nadu' },
    { n: 'Mahabaleshwar', lat: 17.92, lng: 73.66, s: 'Maharashtra' }, { n: 'Ratnagiri', lat: 16.99, lng: 73.31, s: 'Maharashtra' },
    { n: 'Raigad', lat: 18.23, lng: 73.19, s: 'Maharashtra' },
  ];

  var lats = function (a) { return a.map(function (c) { return c.lat; }).join(','); };
  var lngs = function (a) { return a.map(function (c) { return c.lng; }).join(','); };
  var arrify = function (d) { return Array.isArray(d) ? d : [d]; };
  var sig = function (o) { o.district = o.n; return o; };   // city/point name doubles as the "district" label

  async function heat() {
    var d = arrify(await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats(CITIES) + '&longitude=' + lngs(CITIES) + '&daily=temperature_2m_max&forecast_days=1&timezone=auto')).json());
    var out = [];
    d.forEach(function (x, i) {
      var c = CITIES[i]; if (!c || !x || !x.daily) return;
      var t = x.daily.temperature_2m_max && x.daily.temperature_2m_max[0];
      if (t == null || t < 40) return;   // tracker shows heatwave-level only
      out.push(sig({ family: 'climate', kind: 'heat', title: c.n + ' · ' + Math.round(t) + '°C', n: c.n, state: c.s, lat: c.lat, lng: c.lng, level: t >= 45 ? 'high' : t >= 42 ? 'high' : 'medium', detail: (t >= 45 ? 'Severe heatwave' : 'Heatwave') + ' · max ' + Math.round(t) + '°C today', source: 'Open-Meteo' }));
    });
    return out;
  }
  async function aqi() {
    var d = arrify(await (await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lats(CITIES) + '&longitude=' + lngs(CITIES) + '&current=us_aqi,pm2_5&timezone=auto')).json());
    var out = [];
    d.forEach(function (x, i) {
      var c = CITIES[i]; if (!c || !x || !x.current) return;
      var a = x.current.us_aqi, pm = x.current.pm2_5;
      if (a == null || a < 101) return;
      var label = a <= 150 ? 'Unhealthy (sensitive)' : a <= 200 ? 'Unhealthy' : a <= 300 ? 'Very unhealthy' : 'Hazardous';
      out.push(sig({ family: 'health', kind: 'aqi', title: c.n + ' · AQI ' + Math.round(a), n: c.n, state: c.s, lat: c.lat, lng: c.lng, level: a >= 201 ? 'high' : 'medium', detail: label + ' air' + (pm != null ? ' · PM2.5 ' + Math.round(pm) : ''), source: 'Open-Meteo air quality' }));
    });
    return out;
  }
  async function drought() {
    var d = arrify(await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats(DROUGHT) + '&longitude=' + lngs(DROUGHT) + '&hourly=soil_moisture_0_to_7cm,soil_moisture_7_to_28cm&daily=precipitation_sum&past_days=14&forecast_days=1&timezone=auto')).json());
    var tail = function (a, k) { if (!a) return null; var v = a.filter(function (x) { return x != null; }); if (!v.length) return null; var s = v.slice(-k); return s.reduce(function (p, q) { return p + q; }, 0) / s.length; };
    var out = [];
    d.forEach(function (x, i) {
      var c = DROUGHT[i]; if (!c || !x) return;
      var h = x.hourly || {}, s07 = tail(h.soil_moisture_0_to_7cm, 24), s728 = tail(h.soil_moisture_7_to_28cm, 24);
      var sm = s07 != null && s728 != null ? (s07 + s728) / 2 : (s07 != null ? s07 : s728);
      if (sm == null) return;
      var rain = x.daily && x.daily.precipitation_sum ? x.daily.precipitation_sum.reduce(function (p, q) { return p + (q || 0); }, 0) : 0;
      var level = (sm < 0.09 && rain < 12) ? 'high' : (sm < 0.15 && rain < 35) ? 'medium' : null;
      if (!level) return;
      out.push(sig({ family: 'climate', kind: 'drought', title: c.n + ' · dry', n: c.n, state: c.s, lat: c.lat, lng: c.lng, level: level, detail: (level === 'high' ? 'Severe dry' : 'Dry stress') + ' · soil ~' + Math.round(sm * 100) + '% · ' + Math.round(rain) + 'mm/14d', source: 'Open-Meteo' }));
    });
    return out;
  }
  async function landslide() {
    var d = arrify(await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats(LANDSLIDE) + '&longitude=' + lngs(LANDSLIDE) + '&daily=precipitation_sum&past_days=3&forecast_days=2&timezone=auto')).json());
    var out = [];
    d.forEach(function (x, i) {
      var c = LANDSLIDE[i]; if (!c || !x || !x.daily) return;
      var rain = (x.daily.precipitation_sum || []).reduce(function (p, q) { return p + (q || 0); }, 0);
      if (rain < 100) return;
      out.push(sig({ family: 'geo', kind: 'landslide', title: c.n + ' · landslide risk', n: c.n, state: c.s, lat: c.lat, lng: c.lng, level: rain >= 200 ? 'high' : 'medium', detail: (rain >= 200 ? 'High' : 'Elevated') + ' landslide risk · ' + Math.round(rain) + 'mm rain (5d)', source: 'Open-Meteo (rainfall on hills)' }));
    });
    return out;
  }
  async function storm() {
    var d = arrify(await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats(CITIES) + '&longitude=' + lngs(CITIES) + '&daily=precipitation_sum,wind_gusts_10m_max&hourly=cape&forecast_days=1&timezone=auto')).json());
    var out = [];
    d.forEach(function (x, i) {
      var c = CITIES[i]; if (!c || !x) return;
      var rain = x.daily && x.daily.precipitation_sum ? (x.daily.precipitation_sum[0] || 0) : 0;
      var gust = x.daily && x.daily.wind_gusts_10m_max ? (x.daily.wind_gusts_10m_max[0] || 0) : 0;
      var cape = x.hourly && x.hourly.cape ? Math.max.apply(null, [0].concat(x.hourly.cape.filter(function (v) { return v != null; }))) : 0;
      if (!((cape >= 2000 && rain >= 20) || gust >= 60 || rain >= 60)) return;
      var high = cape >= 3000 || gust >= 85 || rain >= 100;
      out.push(sig({ family: 'storm', kind: 'thunderstorm', title: c.n + ' · thunderstorm', n: c.n, state: c.s, lat: c.lat, lng: c.lng, level: high ? 'high' : 'medium', detail: (high ? 'Severe thunderstorm risk' : 'Thunderstorm risk') + ' · ' + Math.round(rain) + 'mm, gusts ' + Math.round(gust) + ' km/h', source: 'Open-Meteo' }));
    });
    return out;
  }

  // Fetch all five in parallel; each failure is isolated so one dead feed never blanks the rest.
  window.fetchWeatherSignals = async function () {
    var jobs = [heat, aqi, drought, landslide, storm].map(function (fn) { return fn().catch(function () { return []; }); });
    var res = await Promise.all(jobs);
    return res.reduce(function (a, b) { return a.concat(b); }, []);
  };
})();
