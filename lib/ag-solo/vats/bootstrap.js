import harden from '@agoric/harden';

// this will return { undefined } until `ag-solo set-gci-ingress`
// has been run to update gci.js
import { GCI } from './gci';

console.log(`loading bootstrap.js`);

function parseArgs(argv) {
  const ROLES = {};
  let gotRoles = false;
  let bootAddress;
  argv.forEach(arg => {
    const match = arg.match(/^--role=(.*)$/);
    if (match) {
      ROLES[match[1]] = true;
      gotRoles = true;
    } else if (!bootAddress && !arg.match(/^-/)) {
      bootAddress = arg;
    }
  });
  if (!gotRoles) {
    ['client', 'chain', 'controller'].forEach(role => {
      ROLES[role] = true;
    });
  }
  return [ROLES, bootAddress];
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E, D) => {
      async function publish(addr, ustore) {
        return harden({
          publish(key, str) {
            helpers.log(`Publishing ${addr} ${key} ${str}`);
            D(ustore).write(addr, key, str);
          },
        });
      }

      async function subscribe(addr, ustore, presence) {
        console.log(`subscribing to ${addr} canvas`);
        D(ustore).watch(addr, 'canvas', presence);
      }

      return harden({
        async bootstrap(argv, vats, devices) {
          console.log(`bootstrap(${argv.join(' ')}) called`);
          const [ROLES, bootAddress] = parseArgs(argv);
          console.log(`Have ROLES`, ROLES, bootAddress);

          D(devices.mailbox).registerInboundHandler(vats.vattp);
          await E(vats.vattp).registerMailboxDevice(devices.mailbox);
          await E(vats.comms).init(vats.vattp);

          // scenario #1: Cloud has: multi-node chain, controller solo node,
          // provisioning server (python). New clients run provisioning
          // client (python) on localhost, which creates client solo node on
          // localhost, with HTML frontend. Multi-player mode.

          // scenario #2: one-node chain running on localhost, solo node on
          // localhost, HTML frontend on localhost. Single-player mode.
          // ROLES.localchain, ROLES.localclient.

          if (ROLES.localchain) {
            console.log(`localchain bootstrap starting`);
            // bootAddress holds the pubkey of localclient
            const pub = publish('public', devices.ustore);
            await E(vats.demo).startup(pub);
            const demoProvider = harden({
              async getDemoBundle(nickname) {
                return E(vats.demo).getChainBundle(nickname);
              },
            });
            await E(vats.comms).addEgress(bootAddress, 1, demoProvider);
            console.log(`localchain vats initialized`);
            return;
          }
          if (ROLES.localclient) {
            console.log(`localclient bootstrap starting`);
            await E(vats.http).setCommandDevice(devices.command, {client: true});
            D(devices.command).registerInboundHandler(vats.http);
            const demoProvider = await E(vats.comms).addIngress(GCI, 1);
            const bundle = await E(demoProvider).getDemoBundle('nickname');
            await E(vats.http).setPresences(bundle);
            //await E(vats.http).setPresences({ chain: chainProvisioner });
            console.log(`localclient vats initialized`);
            return;
          }

          // scenario #3: no chain. solo node on localhost with HTML
          // frontend. Limited subset of demo runs in the solo node.

          if (ROLES.client || ROLES.controller) {
            // Allow http access.
            D(devices.command).registerInboundHandler(vats.http);
            await E(vats.http).setCommandDevice(devices.command, ROLES);
          }

          let chainProvisioner;
          let chainPub;
          if (ROLES.chain) {
            // 'provisioning' vat lives in the chain instances.
            chainPub = publish('public', devices.ustore);
            await E(vats.demo).startup(chainPub);
            await E(vats.provisioning).register(vats.demo, vats.comms);

            const provisioner = harden({
              pleaseProvision(nickname, pubkey) {
                return E(vats.provisioning).pleaseProvision(nickname, pubkey);
              },
            });

            if (bootAddress) {
              // Export the provisioner to our bootstrap address.
              await E(vats.comms).addEgress(bootAddress, 2, provisioner);
            }
            chainProvisioner = provisioner;
          } else if (GCI && ROLES.controller) {
            // Create a presence for the on-chain provisioner.
            chainProvisioner = await E(vats.comms).addIngress(GCI, 2);

            // Allow web requests to call our provisioner.
            const provisioner = harden({
              pleaseProvision(nickname, pubkey) {
                return E(chainProvisioner).pleaseProvision(nickname, pubkey);
              },
            });
            await E(vats.http).setProvisioner(provisioner);
          }

          if (ROLES.client) {
            // Set the chain presence.
            if (chainProvisioner) {
              await E(vats.http).setPresences({ chain: chainProvisioner });
            }
            let chainDemoRoot;
            subscribe(GCI || 'public', devices.ustore, vats.http);
            if (!GCI) {
              chainDemoRoot = vats.demo;
            } else if (chainProvisioner) {
              // The chainProvisioner should be able to give us a bundle.
              const { ingressIndex } = await E(
                chainProvisioner,
              ).pleaseProvision('client', bootAddress);
              console.log(`Adding ingress ${ingressIndex}`);
              chainDemoRoot = await E(vats.comms).addIngress(GCI, ingressIndex);
            } else {
              // The chain demo is already provisioned by the pserver.
              chainDemoRoot = await E(vats.comms).addIngress(GCI, 1);
            }

            const bundle = await E(chainDemoRoot).getChainBundle();
            await E(vats.http).setPresences(bundle);
            if (chainPub) {
              // Need to update our canvas state, since it's not being
              // published by the chain listener.
              const canvasState = await E(bundle.readGallery).getState();
              await E(chainPub).publish('canvas', canvasState);
            }
          }

          console.log('all vats initialized');
        },
      });
    },
    helpers.vatID,
  );
}
