// Generated by CoffeeScript 1.10.0
(function() {
  var ChannelWrapper, EventEmitter, Promise, _, pb, ref,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty,
    slice = [].slice;

  Promise = (ref = global.Promise) != null ? ref : require('es6-promise').Promise;

  EventEmitter = require('events').EventEmitter;

  _ = require('lodash');

  pb = require('promise-breaker');

  ChannelWrapper = (function(superClass) {
    extend(ChannelWrapper, superClass);

    function ChannelWrapper(connectionManager, options) {
      var ref1;
      if (options == null) {
        options = {};
      }
      this._onDisconnect = bind(this._onDisconnect, this);
      this._onConnect = bind(this._onConnect, this);
      this._connectionManager = connectionManager;
      this.name = options.name;
      this._json = (ref1 = options.json) != null ? ref1 : false;
      this._messages = [];
      this._working = false;
      this._settingUp = null;
      this._channel = null;
      this._workerNumber = 0;
      this._setups = [];
      if (options.setup != null) {
        this._setups.push(options.setup);
      }
      if (connectionManager.isConnected()) {
        this._onConnect({
          connection: this._connectionManager._currentConnection
        });
      }
      connectionManager.on('connect', this._onConnect);
      connectionManager.on('disconnect', this._onDisconnect);
    }

    ChannelWrapper.prototype._onConnect = function(arg) {
      var connection;
      connection = arg.connection;
      this._connection = connection;
      return connection.createConfirmChannel().then((function(_this) {
        return function(channel) {
          _this._channel = channel;
          channel.on('close', function() {
            return _this._onChannelClose(channel);
          });
          return _this._settingUp = Promise.all(_this._setups.map(function(setupFn) {
            return pb.callFn(setupFn, 1, null, channel)["catch"](function(err) {
              if (_this._channel) {
                return _this.emit('error', err, {
                  name: _this.name
                });
              } else {

              }
            });
          })).then(function() {
            _this._settingUp = null;
            return _this._channel;
          });
        };
      })(this)).then((function(_this) {
        return function() {
          if (_this._channel == null) {
            return;
          }
          _this._startWorker();
          return _this.emit('connect');
        };
      })(this))["catch"]((function(_this) {
        return function(err) {
          _this.emit('error', err, {
            name: _this.name
          });
          _this._settingUp = null;
          return _this._channel = null;
        };
      })(this));
    };

    ChannelWrapper.prototype._onChannelClose = function(channel) {
      if (this._channel === channel) {
        return this._channel = null;
      }
    };

    ChannelWrapper.prototype._onDisconnect = function() {
      this._channel = null;
      this._settingUp = null;
      return this._working = false;
    };

    ChannelWrapper.prototype.addSetup = pb["break"](function(setup) {
      return Promise.resolve().then((function(_this) {
        return function() {
          _this._setups.push(setup);
          if (_this._channel) {
            return (_this._settingUp || Promise.resolve()).then(function() {
              return setup(_this._channel);
            });
          }
        };
      })(this));
    });

    ChannelWrapper.prototype.removeSetup = pb["break"](function(setup, teardown) {
      this._setups = _.without(this._setups, setup);
      if (this._channel) {
        return (this._settingUp || Promise.resolve()).then((function(_this) {
          return function() {
            return pb.callFn(teardown, 1, null, _this._channel);
          };
        })(this));
      }
    });

    ChannelWrapper.prototype.queueLength = function() {
      return this._messages.length;
    };

    ChannelWrapper.prototype.close = function() {
      var ref1;
      this._working = false;
      if (this._messages.length !== 0) {
        this._messages.forEach(function(message) {
          return message.reject(new Error('Channel closed'));
        });
      }
      this._connectionManager.removeListener('connect', this._onConnect);
      this._connectionManager.removeListener('disconnect', this._onDisconnect);
      if ((ref1 = this._channel) != null) {
        ref1.close();
      }
      this._channel = null;
      return this.emit('close');
    };

    ChannelWrapper.prototype.waitForConnect = pb["break"](function() {
      if (this._channel && !this._settingUp) {
        return Promise.resolve();
      } else {
        return new Promise((function(_this) {
          return function(resolve) {
            return _this.once('connect', resolve);
          };
        })(this));
      }
    });

    ChannelWrapper.prototype._shouldPublish = function() {
      return (this._messages.length > 0) && !this._settingUp && this._channel;
    };

    ChannelWrapper.prototype._startWorker = function() {
      if (!this._working && this._shouldPublish()) {
        this._working = true;
        this._workerNumber++;
        return this._publishQueuedMessages(this._workerNumber);
      }
    };

    ChannelWrapper.prototype._publishQueuedMessages = function(workerNumber) {
      var channel, message;
      if (!this._shouldPublish() || !this._working || (workerNumber !== this._workerNumber)) {
        this._working = false;
        return Promise.resolve();
      }
      channel = this._channel;
      message = this._messages[0];
      Promise.resolve().then((function(_this) {
        return function() {
          var encodedMessage, sendPromise;
          encodedMessage = _this._json ? new Buffer(JSON.stringify(message.content)) : message.content;
          sendPromise = (function() {
            switch (message.type) {
              case 'publish':
                return new Promise(function(resolve, reject) {
                  var result;
                  return result = channel.publish(message.exchange, message.routingKey, encodedMessage, message.options, function(err) {
                    if (err) {
                      return reject(err);
                    }
                    return setImmediate(function() {
                      return resolve(result);
                    });
                  });
                });
              case 'sendToQueue':
                return new Promise(function(resolve, reject) {
                  var result;
                  return result = channel.sendToQueue(message.queue, encodedMessage, message.options, function(err) {
                    if (err) {
                      return reject(err);
                    }
                    return setImmediate(function() {
                      return resolve(result);
                    });
                  });
                });
              default:

                /* !pragma coverage-skip-block */
                throw new Error("Unhandled message type " + message.type);
            }
          })();
          return sendPromise;
        };
      })(this)).then((function(_this) {
        return function(result) {
          _this._messages.shift();
          message.resolve(result);
          return _this._publishQueuedMessages(workerNumber);
        };
      })(this), (function(_this) {
        return function(err) {
          if (!_this._channel) {

          } else {
            _this._messages.shift();
            message.reject(err);
            return _this._publishQueuedMessages(workerNumber);
          }
        };
      })(this))["catch"]((function(_this) {
        return function(err) {

          /* !pragma coverage-skip-block */
          console.error("amqp-connection-manager: ChannelWrapper:_publishQueuedMessages() - How did you get here?", err.stack);
          _this.emit('error', err);
          return _this._working = false;
        };
      })(this));
      return null;
    };

    ChannelWrapper.prototype.ack = function() {
      var args, ref1;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return (ref1 = this._channel) != null ? ref1.ack.apply(ref1, args) : void 0;
    };

    ChannelWrapper.prototype.nack = function() {
      var args, ref1;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return (ref1 = this._channel) != null ? ref1.nack.apply(ref1, args) : void 0;
    };

    ChannelWrapper.prototype.publish = pb["break"](function(exchange, routingKey, content, options) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          _this._messages.push({
            type: 'publish',
            exchange: exchange,
            routingKey: routingKey,
            content: content,
            options: options,
            resolve: resolve,
            reject: reject
          });
          return _this._startWorker();
        };
      })(this));
    });

    ChannelWrapper.prototype.sendToQueue = pb["break"](function(queue, content, options) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          _this._messages.push({
            type: 'sendToQueue',
            queue: queue,
            content: content,
            options: options,
            resolve: resolve,
            reject: reject
          });
          return _this._startWorker();
        };
      })(this));
    });

    return ChannelWrapper;

  })(EventEmitter);

  module.exports = ChannelWrapper;

}).call(this);