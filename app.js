'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class ZyxelNebulaApp extends Homey.App {

  async onInit() {
    this.log('Zyxel Nebula has been initialized');
    this.sitePollers = new Map();
        
    this.homey.flow.getConditionCard('is_device_connected')
      .registerRunListener(async (args, state) => {
        const device = args.device;
        const isDisconnected = device.getCapabilityValue('alarm_disconnected');
        return !isDisconnected;
      });
    
    this.log('Waiting for devices to register...');
  }

  registerDevice(siteId, deviceId, device) {
    if (!this.sitePollers.has(siteId)) {
      this.sitePollers.set(siteId, {
        devices: new Map(),
        interval: null,
        lastData: null
      });
      this.startSitePolling(siteId);
    }
    
    const poller = this.sitePollers.get(siteId);
    poller.devices.set(deviceId, device);
    
    this.log(`Registered device ${deviceId} for site ${siteId}. Total devices: ${poller.devices.size}`);
    
    if (poller.lastData) {
      this.updateDevice(device, deviceId, poller.lastData);
    }
  }

  unregisterDevice(siteId, deviceId) {
    if (!this.sitePollers.has(siteId)) return;
    
    const poller = this.sitePollers.get(siteId);
    poller.devices.delete(deviceId);
    
    this.log(`Unregistered device ${deviceId} from site ${siteId}. Remaining: ${poller.devices.size}`);
    
    if (poller.devices.size === 0) {
      this.stopSitePolling(siteId);
    }
  }

  startSitePolling(siteId) {
    const poller = this.sitePollers.get(siteId);
    if (!poller || poller.interval) return;
    
    this.log(`Starting polling for site ${siteId}`);

    this.pollSite(siteId);
    
    poller.interval = this.homey.setInterval(() => {
      this.pollSite(siteId);
    }, 30000);
  }

  stopSitePolling(siteId) {
    const poller = this.sitePollers.get(siteId);
    if (!poller) return;
    
    this.log(`Stopping polling for site ${siteId}`);
    
    if (poller.interval) {
      this.homey.clearInterval(poller.interval);
      poller.interval = null;
    }
    
    this.sitePollers.delete(siteId);
  }

  async pollSite(siteId) {
    const poller = this.sitePollers.get(siteId);
    if (!poller || poller.devices.size === 0) return;
    
    try {
      const apikey = this.homey.settings.get('apikey');
      if (!apikey) {
        this.error(`No API key found for polling site ${siteId}`);
        return;
      }
      
      this.log(`Polling site ${siteId} (${poller.devices.size} devices)`);
      
      const response = await axios.post(
        `https://api.nebula.zyxel.com/v2/nebula/${siteId}/clients`,
        {
          period: "2h",
          featrues: ["mac_address", "os_hostname"]
        },
        {
          headers: {
            'X-ZyxelNebula-API-Key': apikey
          }
        }
      );
      
      const clientsData = response.data.data;
      poller.lastData = clientsData;
      
      for (const [deviceId, device] of poller.devices) {
        this.updateDevice(device, deviceId, clientsData);
      }
      
    } catch (error) {
      this.error(`Error polling site ${siteId}:`, error.message);
    }
  }

  updateDevice(device, macAddress, clientsData) {
    const clientData = clientsData.find(c => c.macAddress === macAddress);
    
    if (!clientData) {
      this.log(`Client ${macAddress} not found in data`);
      device.updateConnectionStatus(true).catch(err => {
        this.error(`Error updating device ${macAddress}:`, err);
      });
      return;
    }
    
    const isDisconnected = clientData.status !== 'ONLINE';
    device.updateConnectionStatus(isDisconnected).catch(err => {
      this.error(`Error updating device ${macAddress}:`, err);
    });
  }
};