const _ = require('lodash');
const assert = require('chai').assert;
const nock = require('nock');
const sinon = require('sinon');

const HttpTransport = require('..');
const toJson = require('../lib/plugins/asJson');
const toError = require('../lib/plugins/toError');
const log = require('../lib/plugins/logger');
const packageInfo = require('../package');

const sandbox = sinon.sandbox.create();

const url = 'http://www.example.com/';
const host = 'http://www.example.com';
const api = nock(host);
const path = '/';

const simpleResponseBody = 'Illegitimi non carborundum';
const requestBody = {
  foo: 'bar'
};
const responseBody = requestBody;

const toUpperCase = () => {
  return (ctx, next) => {
    return next().then(() => {
      ctx.res.body = ctx.res.body.toUpperCase();
    });
  };
};

function assertFailure(promise, message) {
  return promise
    .then(() => assert.ok(false, 'Promise should have failed'))
    .catch((e) => {
      assert.ok(e);
      if (message) {
        assert.equal(e.message, message);
      }
    });
}

function nockRetries(retry, opts) {
  const httpMethod = _.get(opts, 'httpMethod') || 'get';
  const successCode = _.get(opts, 'successCode') || 200;

  nock.cleanAll();
  api[httpMethod](path).times(retry).reply(500);
  api[httpMethod](path).reply(successCode);
}

describe('HttpTransport', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
    api.get(path).reply(200, simpleResponseBody);
  });

  describe('.get', () => {
    it('returns a response', () => {
      return HttpTransport.createClient()
        .get(url)
        .asResponse()
        .then((res) => {
          assert.equal(res.body, simpleResponseBody);
        });
    });

    it('sets a default User-agent', () => {
      nock.cleanAll();

      const HeaderValue = `${packageInfo.name}/${packageInfo.version}`;
      nock(host, {
          reqheaders: {
            'User-Agent': HeaderValue
          }
        })
        .get(path)
        .reply(200, responseBody);

      return HttpTransport.createClient()
        .get(url)
        .asResponse();
    });

    it('throws if a plugin is not a function', () => {
      assert.throws(() => {
        HttpTransport.createClient()
          .useGlobal('bad plugin')
          .headers();
      }, TypeError, 'Plugin is not a function');
    });
  });

  describe('.retries', () => {
    it('retries a given number of times for failed requests', () => {
      nockRetries(2);

      return HttpTransport.createClient()
        .useGlobal(toError())
        .get(url)
        .retry(2)
        .asResponse()
        .catch(assert.ifError)
        .then((res) => {
          assert.equal(res.statusCode, 200);
        });
    });

    it('tracks retry attempts', () => {
      nockRetries(2);

      const client = HttpTransport.createClient()
        .useGlobal(toError());

      return client.get(url)
        .retry(2)
        .asResponse()
        .catch(assert.ifError)
        .then((res) => {
          const retries = res.retries;
          assert.equal(retries.length, 2);
          assert.equal(retries[0].statusCode, 500);
          assert.match(retries[0].reason, /Request failed for GET http:\/\/www.example.com.*/);
        });
    });
  });


  describe('.post', () => {
    it('makes a POST request', () => {
      api.post(path, requestBody).reply(201, responseBody);

      const client = HttpTransport.createClient();
      return client
        .post(url, requestBody)
        .asBody()
        .then((body) => {
          assert.deepEqual(body, responseBody);
        })
        .catch(assert.ifError);
    });

    it('returns an error when the API returns a 5XX status code', () => {
      api.post(path, requestBody).reply(500);

      const client = HttpTransport.createClient();
      const response = client
        .post(url, requestBody)
        .asResponse();

      return assertFailure(response);
    });
  });

  describe('.put', () => {
    it('makes a PUT request with a JSON body', () => {
      api.put(path, requestBody).reply(201, responseBody);

      const client = HttpTransport.createClient();
      client
        .put(url, requestBody)
        .asBody()
        .then((body) => {
          assert.deepEqual(body, responseBody);
        });
    });

    it('returns an error when the API returns a 5XX status code', () => {
      api.put(path, requestBody).reply(500);

      const client = HttpTransport.createClient();
      const response = client
        .put(url, requestBody)
        .asResponse();

      return assertFailure(response);
    });
  });

  describe('.delete', () => {
    it('makes a DELETE request', () => {
      api.delete(path).reply(204);
      return HttpTransport.createClient().delete(url);
    });

    it('returns an error when the API returns a 5XX status code', () => {
      api.delete(path, requestBody).reply(500);

      const client = HttpTransport.createClient();
      const response = client
        .delete(url, requestBody)
        .asResponse();

      return assertFailure(response);
    });
  });

  describe('.patch', () => {
    it('makes a PATCH request', () => {
      api.patch(path).reply(204);
      return HttpTransport.createClient().patch(url);
    });

    it('returns an error when the API returns a 5XX status code', () => {
      api.patch(path, requestBody).reply(500);

      const client = HttpTransport.createClient();
      const response = client
        .patch(url, requestBody)
        .asResponse();

      return assertFailure(response);
    });
  });

  describe('.head', () => {
    it('makes a HEAD request', () => {
      api.head(path).reply(200);

      return HttpTransport.createClient()
        .head(url)
        .asResponse((res) => {
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(res.body, undefined);
        });
    });

    it('returns an error when the API returns a 5XX status code', () => {
      api.head(path, requestBody).reply(500);

      const client = HttpTransport.createClient();
      const response = client
        .head(url, requestBody)
        .asResponse();

      return assertFailure(response);
    });
  });

  describe('.headers', () => {
    it('sends a custom headers', () => {
      nock.cleanAll();

      const HeaderValue = `${packageInfo.name}/${packageInfo.version}`;
      nock(host, {
          reqheaders: {
            'User-Agent': HeaderValue,
            foo: 'bar'
          }
        })
        .get(path)
        .reply(200, responseBody);

      const response = HttpTransport.createClient()
        .get(url)
        .headers({
          'User-Agent': HeaderValue,
          foo: 'bar'
        })
        .asResponse();

      return response
        .catch(assert.ifError)
        .then((res) => {
          assert.equal(res.statusCode, 200);
        });
    });

    it('asserts for a missing header', () => {
      assert.throws(() => {
        HttpTransport.createClient()
          .get(url)
          .headers();
      }, Error, 'missing headers');
    });

    it('asserts an empty header object', () => {
      assert.throws(() => {
        HttpTransport.createClient()
          .get(url)
          .headers({});
      }, Error, 'missing headers');
    });
  });

  describe('query strings', () => {
    it('supports adding a query string', () => {
      api.get('/?a=1').reply(200, simpleResponseBody);

      const client = HttpTransport.createClient();
      return client
        .get(url)
        .query('a', 1)
        .asBody()
        .then((body) => {
          assert.equal(body, simpleResponseBody);
        });
    });

    it('supports multiple query strings', () => {
      nock.cleanAll();
      api.get('/?a=1&b=2&c=3').reply(200, simpleResponseBody);

      const client = HttpTransport.createClient();
      return client
        .get(url)
        .query({
          'a': 1,
          'b': 2,
          'c': 3,
        })
        .asBody()
        .then((body) => {
          assert.equal(body, simpleResponseBody);
        });
    });

    it('asserts empty query strings object', () => {
      assert.throws(() => {
        HttpTransport.createClient()
          .get(url)
          .query({});
      }, Error, 'missing query strings');
    });
  });

  describe('plugins', () => {
    it('supports a per request plugin', () => {
      nock.cleanAll();
      api.get(path).times(2).reply(200, simpleResponseBody);

      const client = HttpTransport.createClient();

      const upperCaseResponse = client
        .use(toUpperCase())
        .get(url)
        .asBody();

      const lowerCaseResponse = client
        .get(url)
        .asBody();

      return Promise.all([upperCaseResponse, lowerCaseResponse])
        .then((results) => {
          assert.equal(results[0], simpleResponseBody.toUpperCase());
          assert.equal(results[1], simpleResponseBody);
        });
    });

    it('executes global and per request plugins', () => {
      nock.cleanAll();
      api.get(path).reply(200, simpleResponseBody);

      const appendTagGlobally = () => {
        return (ctx, next) => {
          return next()
            .then(() => {
              ctx.res.body = 'global ' + ctx.res.body;
            });
        };
      };

      const appendTagPerRequestTag = () => {
        return (ctx, next) => {

          return next()
            .then(() => {
              ctx.res.body = 'request';
            });
        };
      };
      const client = HttpTransport.createClient();
      client.useGlobal(appendTagGlobally());

      return client
        .use(appendTagPerRequestTag())
        .get(url)
        .asBody()
        .then((body) => {
          assert.equal(body, 'global request');
        });
    });

    it('throws if a global plugin is not a function', () => {
      assert.throws(() => {
        HttpTransport.createClient()
          .useGlobal('bad plugin')
          .headers();
      }, TypeError, 'Plugin is not a function');
    });

    it('throws if a per request plugin is not a function', () => {
      assert.throws(() => {
        const client = HttpTransport.createClient();
        client
          .use('bad plugin')
          .get(url);
      }, TypeError, 'Plugin is not a function');
    });

    describe('toJson', () => {
      it('returns body of a JSON response', () => {
        nock.cleanAll();
        api.get(path).reply(200, responseBody);

        const client = HttpTransport.createClient();
        client.useGlobal(toJson());

        return client
          .get(url)
          .asBody()
          .then((body) => {
            assert.equal(body.foo, 'bar');
          });
      });
    });

    describe('timeout', () => {
      it('sets the a timeout', () => {
        nock.cleanAll();
        api.get('/')
          .socketDelay(1000)
          .reply(200, simpleResponseBody);

        const client = HttpTransport.createClient();
        const response = client
          .get(url)
          .timeout(20)
          .asBody();

        return assertFailure(response, 'Request failed for GET http://www.example.com/: ESOCKETTIMEDOUT');
      });

      it('default timeout');
    });

    describe('logging', () => {
      it('logs each request at info level when a logger is passed in', () => {
        api.get(path).reply(200);

        const stubbedLogger = {
          info: sandbox.stub(),
          warn: sandbox.stub()
        };

        return HttpTransport.createClient()
          .get(url)
          .useGlobal(log(stubbedLogger))
          .asBody()
          .catch(assert.ifError)
          .then(() => {
            const message = stubbedLogger.info.getCall(0).args[0];
            assert.match(message, /GET http:\/\/www.example.com\/ 200 \d+ ms/);
          });
      });
    });

    describe('toError', () => {
      it('returns an error for a non 200 response', () => {
        nock.cleanAll();
        api.get(path).reply(500);

        const client = HttpTransport.createClient();
        const response = client
          .useGlobal(toError())
          .get(url)
          .asBody();

        return assertFailure(response, 'Request failed for GET http://www.example.com/');
      });

      it('includes the status code in the error for a non 200 response', () => {
        nock.cleanAll();
        api.get(path).reply(500);

        const client = HttpTransport.createClient();
        return client
          .get(url)
          .asBody()
          .catch((err) => {
            assert(err);
            assert.equal(err.statusCode, 500);
          });
      });

      it('includes the headers in the error for a non 200 response', () => {
        nock.cleanAll();
        api.get(path).reply(500, {
          error: 'this is the body of the error'
        }, {
          'www-authenticate': 'Bearer realm="/"'
        });

        const client = HttpTransport.createClient();
        const response = client
          .useGlobal(toError())
          .get(url)
          .asBody();

        return response
          .then(() => assert.ok(false, 'Promise should have failed'))
          .catch((err) => {
            assert(err);
            assert.equal(err.headers['www-authenticate'], 'Bearer realm="/"');
          });
      });
    });
  });
});
