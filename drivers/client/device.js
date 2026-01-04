'use strict';

const Homey = require('homey');

module.exports = class ClientDevice extends Homey.Device {

  async onInit() {
    this.log('Client device has been initialized');
    if (!this.hasCapability('ip_address')) {
      await this.addCapability('ip_address');
    }
    
    const store = this.getStore();
    const macAddress = store.id;
    const siteId = store.siteId;
    
    if (!macAddress || !siteId) {
      this.error('Device missing MAC address or site ID in store');
      return;
    }
    
    this.previousConnectionState = null;
    this.homey.app.registerDevice(siteId, macAddress, this);
  }

  async updateConnectionStatus(isDisconnected) {
    const previousState = this.previousConnectionState;
    
    await this.setCapabilityValue('alarm_disconnected', isDisconnected);
    
    if (previousState !== null && previousState !== isDisconnected) {
      if (isDisconnected) {
        this.log('Device disconnected, triggering flow');
        await this.homey.flow.getDeviceTriggerCard('device_disconnected').trigger(this);
      } else {
        this.log('Device reconnected, triggering flow');
        await this.homey.flow.getDeviceTriggerCard('device_reconnected').trigger(this);
      }
    }
    
    this.previousConnectionState = isDisconnected;
  }

  async onAdded() {
    this.log('Client device has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Client device settings where changed');
  }

  async onRenamed(name) {
    this.log('Client device was renamed');
  }

  async onDeleted() {
    this.log('Client device has been deleted');
    
    const store = this.getStore();
    if (store.siteId && store.id) {
      this.homey.app.unregisterDevice(store.siteId, store.id);
    }
  }

};