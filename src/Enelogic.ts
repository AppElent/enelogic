import moment from 'moment';
import fetch from 'node-fetch';

interface IEnelogicOptions {
  startLaag?: number;
  startHoog?: number;
  weekendLaag?: boolean;
}

interface IEnelogicReturnObject {
  consumption_180?: number;
  consumption_181?: number;
  consumption_182?: number;
  consumption_280?: number;
  consumption_281?: number;
  consumption_282?: number;
}

type PeriodType = 'DAY' | 'QUARTER_OF_AN_HOUR' | 'MONTH';

export default class Enelogic {
  public HOST = 'https://enelogic.com/api';

  constructor(private API_KEY: string) {
    this.API_KEY = API_KEY;
  }

  public fetchEnelogic = async (url: string, options?: any) => {
    if (!url.toLowerCase().startsWith('http')) {
      url = this.HOST + url;
    }
    const response = await fetch(url, options);
    if (response.status !== 200) {
      // console.log(response);
      throw new Error(
        'Error fetching enelogic data from URL ' + url + ': ' + response.status + ' - ' + response.statusText,
      );
    }
    const data = await response.json();
    return data;
  };

  public getMeasuringPoints = async () =>
    this.fetchEnelogic(this.HOST + '/measuringpoints?access_token=' + this.API_KEY, {}).catch(err => ({
      message: err,
      success: false,
    }));

  public getMeasuringPointsGas = async () => {
    const data = await this.getMeasuringPoints();
    return data.filter(line => line.unitType === 1);
  };

  public getMeasuringPointsElectricity = async () => {
    const data = await this.getMeasuringPoints();
    return data.filter(line => line.unitType === 0);
  };

  public formatData = (results, data, accessor = 'date') => {
    for (const line of data) {
      const index = results.findIndex(e => e.datetime === line[accessor]);
      const obj = { datetime: line[accessor], [line.rate]: Math.round(parseFloat(line.quantity) * 1000) };
      if (index === -1) {
        results.push(obj);
      } else {
        results[index][line.rate] = Math.round(parseFloat(line.quantity) * 1000);
      }
    }
    return results;
  };

  public addHoogLaagInfo = (results, period: PeriodType, options: IEnelogicOptions = {}) => {
    let previous = results[0];
    for (const entry of results) {
      const index = results.findIndex(e => e.datetime === entry.datetime);

      if (period.toUpperCase() !== 'QUARTER_OF_AN_HOUR') {
        results[index][180] = entry[181] + entry[182];
        results[index][280] = entry[281] + entry[282];
      } else {
        const difference1 = entry[180] - previous[180];
        if (entry[280] === undefined) {
          entry[280] = 0;
          previous[280] = 0;
        }
        const difference2 = entry[280] - previous[280];
        // console.log(index, difference1, difference2);
        const date = new Date(entry.datetime);
        if (!options.startLaag) {
          options.startLaag = 23;
        }
        if (!options.startHoog) {
          options.startHoog = 7;
        }
        if (!options.weekendLaag) {
          options.weekendLaag = true;
        }
        const starthoog = moment(date)
          .hours(options.startHoog)
          .minutes(0)
          .seconds(0);
        const startlaag = moment(date)
          .hours(options.startLaag)
          .minutes(0)
          .seconds(0);
        // console.log(date.getDay(), starthoog.toDate().getTime(), startlaag.toDate().getTime(), date.getTime());
        entry[181] = previous[181];
        entry[182] = previous[182];
        entry[281] = previous[281];
        entry[282] = previous[282];
        if (
          (options.weekendLaag && (date.getDay() === 0 || date.getDay() === 6)) ||
          date.getTime() <= starthoog.toDate().getTime() ||
          date.getTime() > startlaag.toDate().getTime()
        ) {
          entry[181] += difference1;
          entry[281] += difference2;
        } else {
          entry[182] += difference1;
          entry[282] += difference2;
        }
        if (entry[281] === undefined) {
          entry[281] = 0;
        }
        if (entry[282] === undefined) {
          entry[282] = 0;
        }
        results[index] = entry;

        previous = entry;
      }
    }
    return results;
  };

  public getData = async (datefrom, dateto, period: PeriodType, options) => {
    if (!['DAY', 'QUARTER_OF_AN_HOUR', 'MONTH'].includes(period)) {
      throw new Error('You have to specify period (string) as DAY or QUARTER_OF_AN_HOUR or MONTH. Given: ' + period);
    }
    const momentdatefrom = moment(datefrom);
    const momentdateto = moment(dateto);

    let periodUrl;
    switch (period) {
      case 'QUARTER_OF_AN_HOUR':
        periodUrl = 'datapoints';
        break;
      case 'DAY':
        periodUrl = 'datapoint/days';
        break;
      case 'MONTH':
        periodUrl = 'datapoint/months';
    }
    const datapointUrl =
      this.HOST +
      '/measuringpoints/' +
      options.mpointelectra +
      '/' +
      periodUrl +
      '/' +
      momentdatefrom.format('YYYY-MM-DD') +
      '/' +
      momentdateto.format('YYYY-MM-DD') +
      '?access_token=' +
      this.API_KEY;
    const data = await this.fetchEnelogic(datapointUrl);
    return data;
  };

  public getFormattedData = async (datefrom, dateto, period, options) => {
    let results = [];
    const enelogicperiod = period === 'YEAR' ? 'MONTH' : period;
    const momentdateto = period === 'QUARTER_OF_AN_HOUR' ? moment(datefrom).add(1, 'days') : moment(dateto);
    let data = await this.getData(datefrom, momentdateto.format('YYYY-MM-DD'), enelogicperiod, options);
    if (period === 'QUARTER_OF_AN_HOUR') {
      const daydata = await this.getData(datefrom, momentdateto.format('YYYY-MM-DD'), 'DAY', options);
      results = this.formatData(results, daydata, 'date');
    } else if (period === 'YEAR') {
      data = await data.filter(result => moment(result.date).format('MM-DD') === '01-01');
    }
    results = this.formatData(results, data, period === 'QUARTER_OF_AN_HOUR' ? 'datetime' : 'date');
    results.sort((a, b) => (a.datetime > b.datetime ? 1 : -1));
    results = this.addHoogLaagInfo(results, period);
    return results;
  };

  public getYearConsumption = async options => {
    const datapointUrl =
      this.HOST +
      '/measuringpoints/' +
      options.mpointelectra +
      '/datapoint/days/' +
      moment()
        .add(-1, 'years')
        .format('YYYY-MM-DD') +
      '/' +
      moment().format('YYYY-MM-DD') +
      '?access_token=' +
      this.API_KEY;
    const data = await this.fetchEnelogic(datapointUrl);
    const beginstanden = data.slice(0, 4);
    const eindstanden = data.slice(Math.max(data.length - 4, 1));
    const returnObject: IEnelogicReturnObject = {};
    beginstanden.forEach(stand => {
      returnObject['start_' + stand.rate] = stand.quantity;
    });
    eindstanden.forEach(stand => {
      returnObject['end_' + stand.rate] = stand.quantity;
      returnObject['consumption_' + stand.rate] = stand.quantity - returnObject['start_' + stand.rate];
    });
    returnObject.consumption_180 = returnObject.consumption_181 + returnObject.consumption_182;
    returnObject.consumption_280 = returnObject.consumption_281 + returnObject.consumption_282;
    return returnObject;
  };
}
