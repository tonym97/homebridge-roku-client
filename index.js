'use strict';

const { Client, discover, keys } = require('roku-client');
let PlatformAccessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
    PlatformAccessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform('homebridge-roku2', 'RokuHomebridge', RokuPlatform, true);
}

function RokuAccessory(accessoryDesc) {
    let UUID = UUIDGen.generate(accessoryDesc.info.serialNumber);
    PlatformAccessory.call(this, accessoryDesc.info.defaultDeviceName, UUID);

    let self = this;
    self.client = accessoryDesc.client;
    self.rokuDevice = accessoryDesc;
    self.channels = [];
    this.buttons = {};

    self.on('identify', function (paired, callback) {
        callback();
    });

    self.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, accessoryDesc.info.vendorName)
        .setCharacteristic(Characteristic.Model, accessoryDesc.info.modelName)
        .setCharacteristic(Characteristic.Name, accessoryDesc.info.userDeviceName)
        .setCharacteristic(Characteristic.SerialNumber, accessoryDesc.info.serialNumber);

    self.reachable = true;

    if (!accessoryDesc.disableNavigationButtons) {
        self.setupButton(keys.POWER);
        self.setupButton(keys.HOME, "HOME SCREEN");
        self.setupButton(keys.INFO, "OPTIONS");
        self.setupButton(keys.REVERSE, 'REWIND');
        self.setupButton(keys.PLAY, 'PAUSE');
        self.setupButton(keys.PLAY);
        self.setupButton(keys.FORWARD, 'FAST FORWARD');
        self.setupButton(keys.LEFT);
        self.setupButton(keys.RIGHT);
        self.setupButton(keys.UP);
        self.setupButton(keys.DOWN);
        self.setupButton(keys.BACK);
        self.setupButton(keys.ENTER);
        self.setupMute();
        self.setupVolumeUp();
        self.setupVolumeDown();
    }

    self.setupChannels(accessoryDesc);
}

function initializeRokuAccessory() {
    // extend from parent class prototype
    RokuAccessory.prototype = Object.create(PlatformAccessory.prototype); // keeps the proto clean
    RokuAccessory.prototype.constructor = RokuAccessory; // repair the inherited constructor
    RokuAccessory.prototype.setupChannel = function (rokuId, name, id) {
        const channel = new Service.Switch(name, name);

        this.channels.push(channel);
        let self = this;

        channel
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.client.active()
                    .then((app) => {
                        callback(null, app && app.id === id);
                    }, () => {
                    })
                    .catch(callback);
            })
            .on('set', (value, callback) => {
                if (value) {
                    this.client.launch(id)
                        .then(() => {
                            callback(null, true);
                            // this is ugly, probably a better way to do this with prototype callbacks
                            // but being lazy
                            self.channels.forEach(function (channel) {
                                if (channel.displayName !== name) {
                                    channel.getCharacteristic(Characteristic.On).setValue(false, null, true);
                                }
                            });
                        })
                        .catch(callback);
                } else {
                    callback(null, false);
                }
            });

        // set the right initial switch position
        this.client.active()
            .then((app) => {
                if (app !== null) {
                    channel.getCharacteristic(Characteristic.On).setValue(app.id === id, null, true);
                }
                channel.getCharacteristic(Characteristic.On).setValue(false, null, true);
            }, () => {
                channel.getCharacteristic(Characteristic.On).setValue(false, null, true);
            });

        return channel;
    }

    RokuAccessory.prototype.setupChannels = function (accessoryDesc) {
        let self = this;
        accessoryDesc.apps.forEach((app) => {
            self.addService(
                self.setupChannel(accessoryDesc.info.defaultDeviceName, app.name, app.id));
        })
    }

    RokuAccessory.prototype.setupButton = function (command, button) {
        if (!button) {
            button = command;
        }
        const keyService = new Service.Switch(button, button);

        // for now all these switches always look off because I don't have time to do
        // smarter remote control logic and there is no way to query the roku to determine
        // the play/pause/fast forward/rewind states
        keyService
            .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, false))
            .on('set', (value, callback) => {
                this.buttons[button] = value;
                this.client.keypress(command)
                    .then(() => callback(null, false))
                    .catch(callback);
            });

        this.addService(keyService);
    }

    RokuAccessory.prototype.setupMute = function () {
        // Speaker seems to be unsupported, emmulating with a switch
        const mute = new Service.Switch(`Mute`, 'Mute');

        mute
            .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, this.muted))
            .on('set', (value, callback) => {
                this.muted = value;
                const command = this.client.command()
                    // toggling the volume up and down is a reliable way to unmute
                    // the TV if the current state is not known
                    .volumeDown()
                    .volumeUp();

                if (this.muted) {
                    command.volumeMute();
                }

                command.send()
                    .then(() => callback(null))
                    .catch(callback);
            });

        this.addService(mute);
    }

    RokuAccessory.prototype.setupVolumeUp = function () {
        return this.setupVolume(keys.VOLUME_UP);
    }

    RokuAccessory.prototype.setupVolumeDown = function () {
        return this.setupVolume(keys.VOLUME_DOWN);
    }

    RokuAccessory.prototype.setupVolume = function (key) {
        const volume = new Service.Switch(key, key);

        volume
            .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, false))
            .on('set', (value, callback) => {
                this.client.command()
                    .keypress(key, 10)
                    .send()
                    .then(() => callback(null, false))
                    .catch(callback);
            });

        this.addService(volume);
    }
}

RokuAccessory.initializeRoku = function (device) {
    return new Promise((resolve, reject) => {
        let rokuClient = new Client(`http://${device.ipAddress}:8060`);
        rokuClient.info()
            .then(info => {
                rokuClient.apps().then((apps) => {
                    let myApps = [];
                    if (device.channels) {
                        apps.forEach((app) => {
                            if (device.channels.indexOf(app.name) != -1) {
                                myApps.push(app);
                            }
                        });
                    } else {
                        myApps = apps;
                    }
                    let accessoryDesc = {
                        client: rokuClient,
                        info: info,
                        ip: device.ipAddress,
                        apps: myApps,
                        disableNavigationButtons: device.disableNavigationButtons
                    };
                    resolve(accessoryDesc);
                }, (error) => {
                    console.log('Roku Application Discovery Failed')
                });
            }, (error) => {
                console.log('Roku Info Query Failed')
            });
    });
}

function RokuPlatform(log, config, api) {
    initializeRokuAccessory();

    let platform = this;

    this.log = log;
    this.config = config;
    this.accessories = {};

    discover(1000, true).then((addresses) => {
        platform.log('Found Roku Devices at the following IP Addresses: ', addresses);
        let devices = platform.config.devices ? platform.config.devices : [];
        addresses.forEach((address) => {
            let missingDevice = true;
            devices.forEach((device) => {
                if (addresses === device.ipAddress) {
                    missingDevice = false;
                }
            });
            if (missingDevice) {
                devices.push({
                    ipAddress: address
                })
            }
        });
        platform.registerDevices(devices);
    }, () => {
        platform.log('Auto discovery of Roku devices failed');
        if (platform.config && platform.config.devices) {
            platform.devices = platform.config.devices;
            platform.registerDevices(platform.devices);
        }
    });

    if (api) {
        // Save the API object as plugin needs to register new accessory via this object
        this.api = api;

        // Listen to event 'didFinishLaunching', this means homebridge already finished loading cached accessories.
        // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
        // Or start discover new accessories.
        this.api.on('didFinishLaunching', function () {
        }.bind(this));
    }
}

RokuPlatform.prototype.registerDevices = function (devices) {
    let self = this;

    devices.forEach((device) => {
        self.addAccessory(device);
    });
}

RokuPlatform.prototype.configureAccessory = function (accessory) {
    if (this.accessories[accessory.UUID]) {
        return;
    }
    let platform = this;
    accessory.on('identify', function (paired, callback) {
        callback();
    });
    this.accessories[accessory.UUID] = accessory;
}

// Sample function to show how developer can add accessory dynamically from outside event
RokuPlatform.prototype.addAccessory = function (device) {
    let platform = this;

    RokuAccessory.initializeRoku(device).then((accessoryDesc) => {
        let UUID = UUIDGen.generate(accessoryDesc.info.serialNumber);

        let accessory = new RokuAccessory(accessoryDesc);

        // Store accessory in cache
        if (!platform.accessories[UUID]) {
            // Register new accessory in HomeKit
            platform.api.registerPlatformAccessories('homebridge-roku2', 'RokuHomebridge', [accessory]);
            platform.log(`Completed Add Accessory: ${accessoryDesc.info.serialNumber}`);
        }
        platform.accessories[UUID] = accessory;

        return;
    }, (error) => {
        platform.log('Error initializing: ', device.ip);
    });
}

// Sample function to show how developer can remove accessory dynamically from outside event
RokuPlatform.prototype.removeAccessory = function () {
    this.log('Remove Accessory');
    this.api.unregisterPlatformAccessories('homebridge-samplePlatform', 'SamplePlatform', this.accessories);

    this.accessories = {};
}
