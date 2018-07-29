# homebridge-roku-client

Control your Roku media player from your iOS devices using apple's HomeKit. See [homebridge](https://github.com/nfarina/homebridge) for more information controlling 3rd party devices through HomeKit.

Please note that most of this work is based on good work from the original [homebridge-roku](https://github.com/bschlenk/homebridge-roku). This plugin supports multiple Roku's on the same network and provides the option to filter channels and enable/disable navigation buttons.

## Installation

1. Install globally by running `npm install -g homebridge-roku-client`
2. Modify your config.json as mentioned below
3. Ensure all your Roku devices is turned on

### Additional Installation Info

A config file must exist at `~/.homebridge/config.json`. See the [sample config file](https://github.com/tonym97/homebridge-roku-client/blob/master/config.json) for an example.
See [homebridge#installing-plugins](https://github.com/nfarina/homebridge#installing-plugins) for more information.

You can get away with only adding the RokuHomebridge platform with no devices information if you want.  If you do use the devices section the only require option is the ipAddress.  When no channels or flags are specified we assume you want all channels and navigation buttons enable.

## Available Commands

### Hey Siri...
* Turn on Power
* Turn off Power
* Turn on Mute
* Turn off Mute
* Turn on VolumeUp
* Turn on VolumeDown
* Turn on Netflix
* Turn on {app name}

You can also do something like this:

### Hey Siri...
 * VolumeUp in the {room name}
 * Pause in the {room name}
 * Play in the {room name}
 * {app name} in the {room name}
