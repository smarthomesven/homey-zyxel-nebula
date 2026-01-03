'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class ClientDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Client driver has been initialized');
  }

  async onPair(session) {
    session.setHandler("showView", async (viewId) => {
      if (viewId === 'apikey') {
        try {
          const key = this.homey.settings.get('apikey');
          if (key) {
            await session.showView('select_organization');
          }
        } catch (error) {
          throw new Error("Error while checking API key in storage: " + error.message);
        }
      } else if (viewId === 'select_organization') {
        try {
          const apikey = this.homey.settings.get('apikey');
          if (apikey) {
            const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
              headers: {
                'X-ZyxelNebula-API-Key': `${apikey}`
              }
            });
            const links = response.data.filter(d => d.mode === "PRO" || d.mode === "TRIAL");
            if (links.length === 1) {
              this.homey.settings.set('selectedOrgId', links[0].orgId);
              await session.showView('select_site');
            } else {
              return;
            }
          }
        } catch (error) {
          throw new Error("Error while checking Organizations: " + error.message);
        }
      } else if (viewId === 'select_site') {
        try {
          const apikey = this.homey.settings.get('apikey');
          const orgId = this.homey.settings.get('selectedOrgId');
          if (apikey) {
            const response = await axios.get(`https://api.nebula.zyxel.com/v1/nebula/organizations/${orgId}/sites`, {
              headers: {
                'X-ZyxelNebula-API-Key': `${apikey}`
              }
            });
            const links = response.data;
            if (links.length === 1) {
              this.homey.settings.set('selectedSiteId', links[0].siteId);
              await session.showView('list_devices');
            } else {
              return;
            }
          }
        } catch (error) {
          throw new Error("Error while checking Organizations: " + error.message);
        }
      }
    });
    session.setHandler("apikey", async (data) => {
      try {
        this.log('Checking API key:', data.apikey);
        const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
          headers: {
            'X-ZyxelNebula-API-Key': `${data.apikey}`
          }
        });
        this.log('Response from API:', response.data);
        this.homey.settings.set('apikey',data.apikey);
        await session.showView('select_organization');
        return true;
      } catch (error) {
        if (error.response && error.response.status === 401) {
          return false;
        }
        throw new Error("Error during API key check: " + error.message);
      }
    });
    session.setHandler("list_devices", async () => {
      try {
        const key = this.homey.settings.get('apikey');
        const siteId = this.homey.settings.get('selectedSiteId');
        const orgId = this.homey.settings.get('selectedOrgId');
        if (!key || !siteId) {
          throw new Error("API key or site ID not found in storage.");
        }
        const profiles = await axios.post(`https://api.nebula.zyxel.com/v2/nebula/${siteId}/clients`, 
          {
            period: "2h",
            featrues: [
              "mac_address",
              "os_hostname"
            ]
          },
          {
            headers: {
              'X-ZyxelNebula-API-Key': key
            }
          }
        );
        const profiledata = profiles.data;
        const result = profiledata.data.map(client => ({
          name: `${client.description || 'Client'} (${client.macAddress})`,
          data: { id: client.macAddress },
          store: { id: client.macAddress, siteId: siteId, orgId: orgId }
        }));
        return result;
      } catch (error) {
        this.error("Error while fetching profiles:", error.message);
        throw new Error("Error while fetching profiles: " + error.message);
      }
    });
    session.setHandler("getOrgs", async (data) => {
      try {
        const apikey = this.homey.settings.get('apikey');
        if (!apikey) {
          throw new Error("API key not found in storage.");
        }
        const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
          headers: {
            'X-ZyxelNebula-API-Key': `${apikey}`
          }
        });
        const links = response.data.filter(d => d.mode === "TRIAL" || d.mode === "PRO");
        if (links.length === 0) {
          return { error: "nolinks" };
        }
        return {
          links: links.map(link => ({
            id: link.orgId,
            name: link.name
          }))
        };
      } catch (error) {
        throw new Error("Error while fetching organizations: " + error.message);
      }
    });
    session.setHandler("selectedOrg", async (data) => {
      try {
        const id = data.id;
        if (!id) {
          return false;
        }
        this.homey.settings.set('selectedOrgId', id);
        await session.showView('select_site');
        return true;
      } catch (error) {
        throw new Error("Error during org selection: " + error.message);
      }
    });
    session.setHandler("getSites", async (data) => {
      try {
        const apikey = this.homey.settings.get('apikey');
        const orgId = this.homey.settings.get('selectedOrgId');
        if (!apikey || !orgId) {
          throw new Error("API key or organization ID not found in storage.");
        }
        const response = await axios.get(`https://api.nebula.zyxel.com/v1/nebula/organizations/${orgId}/sites`, {
          headers: {
            'X-ZyxelNebula-API-Key': `${apikey}`
          }
        });
        const links = response.data;
        if (links.length === 0) {
          return { error: "nolinks" };
        }
        return {
          links: links.map(link => ({
            id: link.siteId,
            name: link.name
          }))
        };
      } catch (error) {
        throw new Error("Error while fetching sites: " + error.message);
      }
    });
    session.setHandler("selectedSite", async (data) => {
      try {
        const id = data.id;
        if (!id) {
          return false;
        }
        this.homey.settings.set('selectedSiteId', id);
        await session.showView('list_devices');
        return true;
      } catch (error) {
        throw new Error("Error during site selection: " + error.message);
      }
    });
  }

  async onRepair(session) {
    session.setHandler("showView", async (viewId) => {
      if (viewId === 'apikey') {
        try {
          const key = this.homey.settings.get('apikey');
          if (key) {
            await session.showView('select_organization');
          }
        } catch (error) {
          throw new Error("Error while checking API key in storage: " + error.message);
        }
      } else if (viewId === 'select_organization') {
        try {
          const apikey = this.homey.settings.get('apikey');
          if (apikey) {
            const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
              headers: {
                'X-ZyxelNebula-API-Key': `${apikey}`
              }
            });
            const links = response.data.filter(d => d.mode === "PRO" || d.mode === "TRIAL");
            if (links.length === 1) {
              this.homey.settings.set('selectedOrgId', links[0].orgId);
              await session.showView('select_site');
            } else {
              return;
            }
          }
        } catch (error) {
          throw new Error("Error while checking Organizations: " + error.message);
        }
      } else if (viewId === 'select_site') {
        try {
          const apikey = this.homey.settings.get('apikey');
          const orgId = this.homey.settings.get('selectedOrgId');
          if (apikey) {
            const response = await axios.get(`https://api.nebula.zyxel.com/v1/nebula/organizations/${orgId}/sites`, {
              headers: {
                'X-ZyxelNebula-API-Key': `${apikey}`
              }
            });
            const links = response.data;
            if (links.length === 1) {
              this.homey.settings.set('selectedSiteId', links[0].siteId);
              await session.done();
            } else {
              return;
            }
          }
        } catch (error) {
          throw new Error("Error while checking Organizations: " + error.message);
        }
      }
    });
    session.setHandler("apikey", async (data) => {
      try {
        this.log('Checking API key:', data.apikey);
        const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
          headers: {
            'X-ZyxelNebula-API-Key': `${data.apikey}`
          }
        });
        this.log('Response from API:', response.data);
        this.homey.settings.set('apikey',data.apikey);
        await session.showView('select_organization');
        return true;
      } catch (error) {
        if (error.response && error.response.status === 401) {
          return false;
        }
        throw new Error("Error during API key check: " + error.message);
      }
    });
    session.setHandler("getOrgs", async (data) => {
      try {
        const apikey = this.homey.settings.get('apikey');
        if (!apikey) {
          throw new Error("API key not found in storage.");
        }
        const response = await axios.get('https://api.nebula.zyxel.com/v1/nebula/organizations', {
          headers: {
            'X-ZyxelNebula-API-Key': `${apikey}`
          }
        });
        const links = response.data.filter(d => d.mode === "TRIAL" || d.mode === "PRO");
        if (links.length === 0) {
          return { error: "nolinks" };
        }
        return {
          links: links.map(link => ({
            id: link.orgId,
            name: link.name
          }))
        };
      } catch (error) {
        throw new Error("Error while fetching organizations: " + error.message);
      }
    });
    session.setHandler("selectedOrg", async (data) => {
      try {
        const id = data.id;
        if (!id) {
          return false;
        }
        this.homey.settings.set('selectedOrgId', id);
        await session.showView('select_site');
        return true;
      } catch (error) {
        throw new Error("Error during org selection: " + error.message);
      }
    });
    session.setHandler("getSites", async (data) => {
      try {
        const apikey = this.homey.settings.get('apikey');
        const orgId = this.homey.settings.get('selectedOrgId');
        if (!apikey || !orgId) {
          throw new Error("API key or organization ID not found in storage.");
        }
        const response = await axios.get(`https://api.nebula.zyxel.com/v1/nebula/organizations/${orgId}/sites`, {
          headers: {
            'X-ZyxelNebula-API-Key': `${apikey}`
          }
        });
        const links = response.data;
        if (links.length === 0) {
          return { error: "nolinks" };
        }
        return {
          links: links.map(link => ({
            id: link.siteId,
            name: link.name
          }))
        };
      } catch (error) {
        throw new Error("Error while fetching sites: " + error.message);
      }
    });
    session.setHandler("selectedSite", async (data) => {
      try {
        const id = data.id;
        if (!id) {
          return false;
        }
        this.homey.settings.set('selectedSiteId', id);
        await session.done();
        return true;
      } catch (error) {
        throw new Error("Error during site selection: " + error.message);
      }
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      // Example device data, note that `store` is optional
      // {
      //   name: 'My Device',
      //   data: {
      //     id: 'my-device',
      //   },
      //   store: {
      //     address: '127.0.0.1',
      //   },
      // },
    ];
  }

};
