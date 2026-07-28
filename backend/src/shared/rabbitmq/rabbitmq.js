import amqp from "amqplib";
import dotenv from "dotenv";

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = "cortex.events";
const DLX_NAME = "cortex.dlx";
const DLQ_NAME = "cortex.dlq";

class RabbitMQManager {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.listeners = [];
  }

  async connect() {
    if (this.isConnected) return;

    let attempts = 0;
    const maxAttempts = 5;
    const delay = 3000;

    while (attempts < maxAttempts) {
      try {
        console.log(
          `[RabbitMQ] Connecting to ${RABBITMQ_URL} (Attempt ${attempts + 1}/${maxAttempts})...`
        );
        this.connection = await amqp.connect(RABBITMQ_URL);
        this.channel = await this.connection.createChannel();
        this.isConnected = true;
        console.log("[RabbitMQ] Connected and channel created.");

        this.connection.on("error", (err) => {
          console.error(`[RabbitMQ] Connection error: ${err.message}`);
          this.handleDisconnect();
        });

        this.connection.on("close", () => {
          console.warn("[RabbitMQ] Connection closed.");
          this.handleDisconnect();
        });

        await this.initializeBroker();
        await this.reRegisterListeners();
        return;
      } catch (error) {
        attempts++;
        console.warn(`[RabbitMQ] Connection failed: ${error.message}`);
        if (attempts >= maxAttempts) {
          console.warn("[RabbitMQ] RabbitMQ unavailable; proceeding with direct internal processing.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async initializeBroker() {
    if (!this.channel) return;
    await this.channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    await this.channel.assertExchange(DLX_NAME, "direct", { durable: true });
    await this.channel.assertQueue(DLQ_NAME, { durable: true });
    await this.channel.bindQueue(DLQ_NAME, DLX_NAME, "dead-letter");
  }

  async handleDisconnect() {
    this.isConnected = false;
    setTimeout(
      () => this.connect().catch((err) => console.error("[RabbitMQ] Reconnect fail:", err.message)),
      5000
    );
  }

  async publish(routingKey, message) {
    if (!this.isConnected || !this.channel) {
      console.warn(`[RabbitMQ] Not connected. Event '${routingKey}' will be handled in-process.`);
      return false;
    }
    const content = Buffer.from(JSON.stringify(message));
    return this.channel.publish(EXCHANGE_NAME, routingKey, content, {
      persistent: true,
    });
  }

  async consume(queueName, routingKey, onMessage) {
    this.listeners.push({ queueName, routingKey, onMessage });

    if (!this.isConnected || !this.channel) {
      return;
    }

    await this.setupSubscription(queueName, routingKey, onMessage);
  }

  async setupSubscription(queueName, routingKey, onMessage) {
    if (!this.channel) return;
    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": DLX_NAME,
        "x-dead-letter-routing-key": "dead-letter",
      },
    });

    await this.channel.bindQueue(queueName, EXCHANGE_NAME, routingKey);

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString());
          await onMessage(content, msg);
          this.channel.ack(msg);
        } catch (error) {
          console.error(
            `[RabbitMQ] Error processing message on queue '${queueName}': ${error.message}`
          );
          this.channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  }

  async reRegisterListeners() {
    for (const listener of this.listeners) {
      await this.setupSubscription(listener.queueName, listener.routingKey, listener.onMessage);
    }
  }

  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      this.isConnected = false;
      console.log("[RabbitMQ] Connection closed gracefully.");
    } catch (err) {
      console.error(`[RabbitMQ] Error closing connection: ${err.message}`);
    }
  }
}

const rabbitMQ = new RabbitMQManager();
export default rabbitMQ;
