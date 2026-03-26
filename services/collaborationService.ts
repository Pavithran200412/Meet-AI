import { CollabMessage, CollabEventType, Peer } from '../types';
import { v4 as uuidv4 } from 'uuid';

const CHANNEL_NAME = 'nexus_ai_collab_v1';
const HEARTBEAT_INTERVAL = 3000;
const PEER_TIMEOUT = 7000;
class CollaborationService {
  private channel: BroadcastChannel;
  private userId: string;
  private username: string;
  private color: string;
  private peers: Map<string, Peer> = new Map();
  
  private onMessageCallbacks: Array<(msg: CollabMessage) => void> = [];
  private onPeersUpdateCallbacks: Array<(peers: Peer[]) => void> = [];
  
  private heartbeatInterval: any;
  private cleanupInterval: any;

  constructor() {
    this.userId = uuidv4();
    this.username = `User_${this.userId.slice(0, 4)}`;
    this.color = '#' + Math.floor(Math.random()*16777215).toString(16);
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    
    this.channel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Start presence system
    this.startHeartbeat();
  }

  public getUserId() {
    return this.userId;
  }

  public subscribe(callback: (msg: CollabMessage) => void) {
    this.onMessageCallbacks.push(callback);
  }

  public subscribeToPeers(callback: (peers: Peer[]) => void) {
    this.onPeersUpdateCallbacks.push(callback);
    // Initial emit
    callback(Array.from(this.peers.values()));
  }

  public unsubscribe(callback: Function) {
    this.onMessageCallbacks = this.onMessageCallbacks.filter(cb => cb !== callback);
    this.onPeersUpdateCallbacks = this.onPeersUpdateCallbacks.filter(cb => cb !== callback);
  }

  public broadcast(type: CollabEventType, payload: any) {
    const msg: CollabMessage = {
      type,
      payload,
      senderId: this.userId,
      timestamp: Date.now()
    };
    this.channel.postMessage(msg);
  }

  public broadcastMcpEvent(toolName: string, status: 'started' | 'completed' | 'failed', details?: any) {
    this.broadcast('MCP_EVENT', {
      toolName,
      status,
      details,
      timestamp: Date.now()
    });
  }

  private handleMessage(msg: CollabMessage) {
    // Ignore self (though BroadcastChannel usually doesn't send to self, good practice)
    if (msg.senderId === this.userId) return;

    if (msg.type === 'PRESENCE') {
      this.handlePresence(msg);
    } else {
      // Forward other messages to subscribers (CodeEditor)
      this.onMessageCallbacks.forEach(cb => cb(msg));
    }
  }

  private handlePresence(msg: CollabMessage) {
    const { username, color } = msg.payload;
    this.peers.set(msg.senderId, {
      id: msg.senderId,
      lastSeen: Date.now(),
      username,
      color
    });
    this.notifyPeersUpdate();
  }

  private startHeartbeat() {
    // Send immediate heartbeat
    this.sendHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      this.peers.forEach((peer, id) => {
        if (now - peer.lastSeen > PEER_TIMEOUT) {
          this.peers.delete(id);
          changed = true;
        }
      });
      if (changed) this.notifyPeersUpdate();
    }, HEARTBEAT_INTERVAL);
  }

  private sendHeartbeat() {
    this.broadcast('PRESENCE', {
      username: this.username,
      color: this.color
    });
  }

  private notifyPeersUpdate() {
    const peerList = Array.from(this.peers.values());
    this.onPeersUpdateCallbacks.forEach(cb => cb(peerList));
  }

  public destroy() {
    clearInterval(this.heartbeatInterval);
    clearInterval(this.cleanupInterval);
    this.channel.close();
  }
}

// Singleton instance
export const collabService = new CollaborationService();