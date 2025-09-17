/**
 * In-Memory Storage Service for Advanced Features
 * In production, this would be replaced with a real database (PostgreSQL, MongoDB, etc.)
 */

import { 
  SubscriptionPlan, 
  Subscription, 
  Invoice
} from '../types/subscription.types';
import { IdempotencyKey } from '../types/idempotency.types';
import { WebhookEvent, WebhookEndpoint, WebhookDelivery } from '../types/webhook.types';
import logger from '../utils/logger';

class StorageService {
  // Subscription data
  private plans: Map<string, SubscriptionPlan> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  
  // Idempotency data
  private idempotencyKeys: Map<string, IdempotencyKey> = new Map();
  
  // Webhook data
  private webhookEvents: Map<string, WebhookEvent> = new Map();
  private webhookEndpoints: Map<string, WebhookEndpoint> = new Map();
  private webhookDeliveries: Map<string, WebhookDelivery> = new Map();
  
  // Customer data (simplified)
  private customers: Map<string, any> = new Map();

  constructor() {
    this.initializeDefaultData();
    this.startCleanupJobs();
  }

  // ============= SUBSCRIPTION PLAN METHODS =============

  async createPlan(plan: SubscriptionPlan): Promise<SubscriptionPlan> {
    this.plans.set(plan.id, plan);
    logger.info('Plan created', { planId: plan.id, name: plan.name });
    return plan;
  }

  async getPlan(planId: string): Promise<SubscriptionPlan | null> {
    return this.plans.get(planId) || null;
  }

  async updatePlan(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const updatedPlan = { ...plan, ...updates, updatedAt: new Date() };
    this.plans.set(planId, updatedPlan);
    logger.info('Plan updated', { planId, updates });
    return updatedPlan;
  }

  async listPlans(): Promise<SubscriptionPlan[]> {
    return Array.from(this.plans.values());
  }

  async deletePlan(planId: string): Promise<boolean> {
    const deleted = this.plans.delete(planId);
    if (deleted) {
      logger.info('Plan deleted', { planId });
    }
    return deleted;
  }

  // ============= SUBSCRIPTION METHODS =============

  async createSubscription(subscription: Subscription): Promise<Subscription> {
    this.subscriptions.set(subscription.id, subscription);
    logger.info('Subscription created', { 
      subscriptionId: subscription.id, 
      customerId: subscription.customerId,
      planId: subscription.planId 
    });
    return subscription;
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptions.get(subscriptionId) || null;
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return null;

    const updatedSubscription = { ...subscription, ...updates, updatedAt: new Date() };
    this.subscriptions.set(subscriptionId, updatedSubscription);
    logger.info('Subscription updated', { subscriptionId, updates });
    return updatedSubscription;
  }

  async getCustomerSubscriptions(customerId: string): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.customerId === customerId);
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.status === 'active' || sub.status === 'trialing');
  }

  async getDueSubscriptions(): Promise<Subscription[]> {
    const now = new Date();
    return Array.from(this.subscriptions.values())
      .filter(sub => 
        (sub.status === 'active' || sub.status === 'trialing') && 
        sub.nextPaymentDate <= now
      );
  }

  // ============= INVOICE METHODS =============

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    this.invoices.set(invoice.id, invoice);
    logger.info('Invoice created', { 
      invoiceId: invoice.id,
      subscriptionId: invoice.subscriptionId,
      amount: invoice.amount 
    });
    return invoice;
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    return this.invoices.get(invoiceId) || null;
  }

  async updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<Invoice | null> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    const updatedInvoice = { ...invoice, ...updates, updatedAt: new Date() };
    this.invoices.set(invoiceId, updatedInvoice);
    logger.info('Invoice updated', { invoiceId, updates });
    return updatedInvoice;
  }

  async getSubscriptionInvoices(subscriptionId: string): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter(invoice => invoice.subscriptionId === subscriptionId);
  }

  async getUnpaidInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter(invoice => invoice.status === 'open' && invoice.dueDate <= new Date());
  }

  // ============= IDEMPOTENCY METHODS =============

  async storeIdempotencyKey(key: IdempotencyKey): Promise<IdempotencyKey> {
    this.idempotencyKeys.set(key.key, key);
    logger.debug('Idempotency key stored', { key: key.key, requestPath: key.requestPath });
    return key;
  }

  async getIdempotencyKey(key: string): Promise<IdempotencyKey | null> {
    const record = this.idempotencyKeys.get(key);
    if (record && record.expiresAt < new Date()) {
      this.idempotencyKeys.delete(key);
      return null;
    }
    return record || null;
  }

  async updateIdempotencyKey(key: string, updates: Partial<IdempotencyKey>): Promise<IdempotencyKey | null> {
    const record = this.idempotencyKeys.get(key);
    if (!record) return null;

    const updated = { ...record, ...updates, lastAccessedAt: new Date() };
    this.idempotencyKeys.set(key, updated);
    return updated;
  }

  async deleteIdempotencyKey(key: string): Promise<boolean> {
    return this.idempotencyKeys.delete(key);
  }

  // ============= WEBHOOK METHODS =============

  async createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent> {
    this.webhookEvents.set(event.id, event);
    logger.info('Webhook event created', { eventId: event.id, type: event.type });
    return event;
  }

  async getWebhookEvent(eventId: string): Promise<WebhookEvent | null> {
    return this.webhookEvents.get(eventId) || null;
  }

  async createWebhookEndpoint(endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
    this.webhookEndpoints.set(endpoint.id, endpoint);
    logger.info('Webhook endpoint created', { endpointId: endpoint.id, url: endpoint.url });
    return endpoint;
  }

  async getWebhookEndpoint(endpointId: string): Promise<WebhookEndpoint | null> {
    return this.webhookEndpoints.get(endpointId) || null;
  }

  async updateWebhookEndpoint(endpointId: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint | null> {
    const endpoint = this.webhookEndpoints.get(endpointId);
    if (!endpoint) return null;

    const updated = { ...endpoint, ...updates, updatedAt: new Date() };
    this.webhookEndpoints.set(endpointId, updated);
    logger.info('Webhook endpoint updated', { endpointId, updates });
    return updated;
  }

  async listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    return Array.from(this.webhookEndpoints.values());
  }

  async deleteWebhookEndpoint(endpointId: string): Promise<boolean> {
    const deleted = this.webhookEndpoints.delete(endpointId);
    if (deleted) {
      logger.info('Webhook endpoint deleted', { endpointId });
    }
    return deleted;
  }

  async createWebhookDelivery(delivery: WebhookDelivery): Promise<WebhookDelivery> {
    this.webhookDeliveries.set(delivery.id, delivery);
    return delivery;
  }

  async getWebhookDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    return this.webhookDeliveries.get(deliveryId) || null;
  }

  async updateWebhookDelivery(deliveryId: string, updates: Partial<WebhookDelivery>): Promise<WebhookDelivery | null> {
    const delivery = this.webhookDeliveries.get(deliveryId);
    if (!delivery) return null;

    const updated = { ...delivery, ...updates };
    this.webhookDeliveries.set(deliveryId, updated);
    return updated;
  }

  async getEndpointDeliveries(endpointId: string): Promise<WebhookDelivery[]> {
    return Array.from(this.webhookDeliveries.values())
      .filter(delivery => delivery.endpointId === endpointId);
  }

  async getPendingDeliveries(): Promise<WebhookDelivery[]> {
    return Array.from(this.webhookDeliveries.values())
      .filter(delivery => 
        delivery.status === 'pending' || 
        (delivery.status === 'retrying' && delivery.nextRetryAt && delivery.nextRetryAt <= new Date())
      );
  }

  // ============= CUSTOMER METHODS =============

  async createCustomer(customer: any): Promise<any> {
    this.customers.set(customer.id, customer);
    logger.info('Customer created', { customerId: customer.id });
    return customer;
  }

  async getCustomer(customerId: string): Promise<any | null> {
    return this.customers.get(customerId) || null;
  }

  async updateCustomer(customerId: string, updates: any): Promise<any | null> {
    const customer = this.customers.get(customerId);
    if (!customer) return null;

    const updated = { ...customer, ...updates, updatedAt: new Date() };
    this.customers.set(customerId, updated);
    return updated;
  }

  // ============= UTILITY METHODS =============

  private initializeDefaultData(): void {
    // Create some default plans for testing
    const basicPlan: SubscriptionPlan = {
      id: 'plan_basic_monthly',
      name: 'Basic Monthly Plan',
      description: 'Basic plan with monthly billing',
      amount: 999, // $9.99
      currency: 'USD',
      interval: 'monthly',
      intervalCount: 1,
      trialPeriodDays: 14,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const proPlan: SubscriptionPlan = {
      id: 'plan_pro_monthly',
      name: 'Pro Monthly Plan',
      description: 'Pro plan with monthly billing',
      amount: 2999, // $29.99
      currency: 'USD',
      interval: 'monthly',
      intervalCount: 1,
      trialPeriodDays: 7,
      setupFee: 500, // $5.00 setup fee
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.plans.set(basicPlan.id, basicPlan);
    this.plans.set(proPlan.id, proPlan);

    // Create a default customer
    const defaultCustomer = {
      id: 'cust_default_test',
      email: 'test@example.com',
      name: 'Test Customer',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.customers.set(defaultCustomer.id, defaultCustomer);

    logger.info('Default storage data initialized');
  }

  private startCleanupJobs(): void {
    // Clean up expired idempotency keys every hour
    setInterval(() => {
      const now = new Date();
      const expired: string[] = [];
      
      for (const [key, record] of this.idempotencyKeys.entries()) {
        if (record.expiresAt < now) {
          expired.push(key);
        }
      }
      
      expired.forEach(key => this.idempotencyKeys.delete(key));
      
      if (expired.length > 0) {
        logger.info('Cleaned up expired idempotency keys', { count: expired.length });
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Storage cleanup jobs started');
  }

  // ============= DEBUG/TESTING METHODS =============

  getStorageStats() {
    return {
      plans: this.plans.size,
      subscriptions: this.subscriptions.size,
      invoices: this.invoices.size,
      idempotencyKeys: this.idempotencyKeys.size,
      webhookEvents: this.webhookEvents.size,
      webhookEndpoints: this.webhookEndpoints.size,
      webhookDeliveries: this.webhookDeliveries.size,
      customers: this.customers.size
    };
  }

  clearAllData(): void {
    this.plans.clear();
    this.subscriptions.clear();
    this.invoices.clear();
    this.idempotencyKeys.clear();
    this.webhookEvents.clear();
    this.webhookEndpoints.clear();
    this.webhookDeliveries.clear();
    this.customers.clear();
    this.initializeDefaultData();
    logger.info('All storage data cleared and reinitialized');
  }
}

// Export singleton instance
export default new StorageService();
