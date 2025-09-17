/**
 * Subscription Management Service
 * Handles recurring billing, subscription lifecycle, and invoice generation
 */

import { v4 as uuidv4 } from 'uuid';
import storageService from './storageService';
import { MockPaymentService } from './mockPaymentService';
import { WebhookService } from './webhookService';
import {
  SubscriptionPlan,
  Subscription,
  Invoice,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  CreatePlanRequest,
  SubscriptionResponse,
  PlanResponse,
  RecurringPaymentResult,
  SubscriptionStatus
} from '../types/subscription.types';
import { PaymentRequest } from '../types/payment.types';
import logger from '../utils/logger';

export class SubscriptionService {
  private paymentService: MockPaymentService;
  private webhookService: WebhookService;

  constructor() {
    this.paymentService = new MockPaymentService();
    this.webhookService = new WebhookService();
    this.startRecurringBillingJob();
  }

  // ============= PLAN MANAGEMENT =============

  async createPlan(request: CreatePlanRequest): Promise<PlanResponse> {
    try {
      const plan: SubscriptionPlan = {
        id: `plan_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        name: request.name,
        description: request.description,
        amount: request.amount,
        currency: request.currency,
        interval: request.interval,
        intervalCount: request.intervalCount || 1,
        trialPeriodDays: request.trialPeriodDays,
        setupFee: request.setupFee,
        metadata: request.metadata,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const createdPlan = await storageService.createPlan(plan);
      
      // Emit webhook event
      await this.webhookService.emitEvent('plan.created', { plan: createdPlan });

      logger.info('Plan created successfully', { planId: plan.id, name: plan.name });

      return {
        success: true,
        data: createdPlan
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create plan', { error: errorMessage, request });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async getPlan(planId: string): Promise<PlanResponse> {
    try {
      const plan = await storageService.getPlan(planId);
      
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found'
        };
      }

      return {
        success: true,
        data: plan
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get plan', { error: errorMessage, planId });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async listPlans(): Promise<{ success: boolean; data?: SubscriptionPlan[]; error?: string }> {
    try {
      const plans = await storageService.listPlans();
      
      return {
        success: true,
        data: plans.filter(plan => plan.active)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list plans', { error: errorMessage });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // ============= SUBSCRIPTION MANAGEMENT =============

  async createSubscription(request: CreateSubscriptionRequest): Promise<SubscriptionResponse> {
    try {
      // Validate plan exists
      const plan = await storageService.getPlan(request.planId);
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found'
        };
      }

      // Validate customer exists
      const customer = await storageService.getCustomer(request.customerId);
      if (!customer) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      // Check for existing active subscription
      const existingSubscriptions = await storageService.getCustomerSubscriptions(request.customerId);
      const activeSubscription = existingSubscriptions.find(sub => 
        sub.planId === request.planId && 
        ['active', 'trialing'].includes(sub.status)
      );

      if (activeSubscription) {
        return {
          success: false,
          error: 'Customer already has an active subscription for this plan'
        };
      }

      // Calculate dates
      const now = new Date();
      const trialPeriodDays = request.trialPeriodDays || plan.trialPeriodDays || 0;
      
      let trialStart: Date | undefined;
      let trialEnd: Date | undefined;
      let nextPaymentDate: Date;

      if (trialPeriodDays > 0) {
        trialStart = new Date(now);
        trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + trialPeriodDays);
        nextPaymentDate = new Date(trialEnd);
      } else {
        nextPaymentDate = new Date(now);
      }

      const currentPeriodStart = trialStart || new Date(now);
      const currentPeriodEnd = this.calculateNextBillingDate(currentPeriodStart, plan.interval, plan.intervalCount);

      // Create subscription
      const subscription: Subscription = {
        id: `sub_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        customerId: request.customerId,
        planId: request.planId,
        status: trialPeriodDays > 0 ? 'trialing' : 'active',
        currentPeriodStart,
        currentPeriodEnd,
        trialStart,
        trialEnd,
        cancelAtPeriodEnd: false,
        paymentMethodId: request.paymentMethodId,
        quantity: request.quantity || 1,
        metadata: request.metadata,
        nextPaymentDate,
        failedPaymentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const createdSubscription = await storageService.createSubscription(subscription);

      // Process setup fee if applicable
      if (plan.setupFee && plan.setupFee > 0 && !trialPeriodDays) {
        await this.processSetupFee(createdSubscription, plan);
      }

      // Create initial invoice if not in trial
      if (!trialPeriodDays) {
        await this.createInvoiceForSubscription(createdSubscription, plan);
      }

      // Emit webhook event
      await this.webhookService.emitEvent('subscription.created', { subscription: createdSubscription });

      logger.info('Subscription created successfully', { 
        subscriptionId: subscription.id,
        customerId: request.customerId,
        planId: request.planId,
        status: subscription.status
      });

      return {
        success: true,
        data: createdSubscription
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create subscription', { error: errorMessage, request });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResponse> {
    try {
      const subscription = await storageService.getSubscription(subscriptionId);
      
      if (!subscription) {
        return {
          success: false,
          error: 'Subscription not found'
        };
      }

      return {
        success: true,
        data: subscription
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get subscription', { error: errorMessage, subscriptionId });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async updateSubscription(subscriptionId: string, request: UpdateSubscriptionRequest): Promise<SubscriptionResponse> {
    try {
      const subscription = await storageService.getSubscription(subscriptionId);
      
      if (!subscription) {
        return {
          success: false,
          error: 'Subscription not found'
        };
      }

      if (subscription.status === 'canceled') {
        return {
          success: false,
          error: 'Cannot update canceled subscription'
        };
      }

      const updates: Partial<Subscription> = {
        ...request,
        updatedAt: new Date()
      };

      // Handle plan change
      if (request.planId && request.planId !== subscription.planId) {
        const newPlan = await storageService.getPlan(request.planId);
        if (!newPlan) {
          return {
            success: false,
            error: 'New plan not found'
          };
        }

        // Prorate and create invoice for plan change
        await this.handlePlanChange(subscription, newPlan);
        updates.planId = request.planId;
      }

      const updatedSubscription = await storageService.updateSubscription(subscriptionId, updates);
      
      if (!updatedSubscription) {
        return {
          success: false,
          error: 'Failed to update subscription'
        };
      }

      // Emit webhook event
      await this.webhookService.emitEvent('subscription.updated', { subscription: updatedSubscription });

      logger.info('Subscription updated successfully', { subscriptionId, updates });

      return {
        success: true,
        data: updatedSubscription
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update subscription', { error: errorMessage, subscriptionId, request });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = false): Promise<SubscriptionResponse> {
    try {
      const subscription = await storageService.getSubscription(subscriptionId);
      
      if (!subscription) {
        return {
          success: false,
          error: 'Subscription not found'
        };
      }

      if (subscription.status === 'canceled') {
        return {
          success: false,
          error: 'Subscription is already canceled'
        };
      }

      const updates: Partial<Subscription> = {
        cancelAtPeriodEnd,
        updatedAt: new Date()
      };

      if (!cancelAtPeriodEnd) {
        updates.status = 'canceled';
        updates.canceledAt = new Date();
      }

      const updatedSubscription = await storageService.updateSubscription(subscriptionId, updates);
      
      if (!updatedSubscription) {
        return {
          success: false,
          error: 'Failed to cancel subscription'
        };
      }

      // Emit webhook event
      await this.webhookService.emitEvent('subscription.canceled', { subscription: updatedSubscription });

      logger.info('Subscription canceled successfully', { 
        subscriptionId, 
        cancelAtPeriodEnd,
        status: updatedSubscription.status
      });

      return {
        success: true,
        data: updatedSubscription
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cancel subscription', { error: errorMessage, subscriptionId });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // ============= RECURRING BILLING =============

  async processRecurringPayments(): Promise<void> {
    try {
      const dueSubscriptions = await storageService.getDueSubscriptions();
      logger.info('Processing recurring payments', { count: dueSubscriptions.length });

      for (const subscription of dueSubscriptions) {
        await this.processSubscriptionPayment(subscription);
        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error processing recurring payments', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processSubscriptionPayment(subscription: Subscription): Promise<RecurringPaymentResult> {
    try {
      const plan = await storageService.getPlan(subscription.planId);
      if (!plan) {
        logger.error('Plan not found for subscription', { subscriptionId: subscription.id, planId: subscription.planId });
        return { success: false, error: 'Plan not found' };
      }

      const customer = await storageService.getCustomer(subscription.customerId);
      if (!customer) {
        logger.error('Customer not found for subscription', { subscriptionId: subscription.id, customerId: subscription.customerId });
        return { success: false, error: 'Customer not found' };
      }

      // Create invoice
      const invoice = await this.createInvoiceForSubscription(subscription, plan);

      // Process payment
      const paymentRequest: PaymentRequest = {
        amount: plan.amount * subscription.quantity,
        orderId: `invoice_${invoice.id}`,
        customerInfo: {
          firstName: customer.name?.split(' ')[0] || 'Unknown',
          lastName: customer.name?.split(' ').slice(1).join(' ') || 'Customer',
          email: customer.email
        },
        paymentMethod: {
          type: 'credit_card',
          cardNumber: '4111111111111111', // Mock card for testing
          expirationDate: '1225', // MMYY format
          cvv: '123'
        },
        metadata: {
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          planId: plan.id
        }
      };

      try {
        const paymentResult = await this.paymentService.processPayment(paymentRequest);
        
        // Payment succeeded
        await this.handleSuccessfulPayment(subscription, invoice, paymentResult.transactionId);
        
        // Emit webhook events
        await this.webhookService.emitEvent('subscription.payment_succeeded', { 
          subscription, 
          invoice,
          payment: {
            id: paymentResult.transactionId,
            amount: paymentResult.amount,
            currency: 'USD',
            status: 'succeeded',
            metadata: paymentResult.metadata
          }
        });
        await this.webhookService.emitEvent('invoice.payment_succeeded', { 
          invoice,
          payment: {
            id: paymentResult.transactionId,
            amount: paymentResult.amount,
            currency: 'USD',
            status: 'succeeded',
            metadata: paymentResult.metadata
          }
        });

        return {
          success: true,
          transactionId: paymentResult.transactionId,
          invoiceId: invoice.id,
          amount: plan.amount * subscription.quantity
        };
      } catch (error) {
        // Payment failed
        const errorMessage = error instanceof Error ? error.message : 'Payment failed';
        await this.handleFailedPayment(subscription, invoice, errorMessage);
        
        // Emit webhook events (for failed payments, we include metadata with error info)
        await this.webhookService.emitEvent('subscription.payment_failed', { 
          subscription, 
          invoice,
          payment: {
            id: 'failed_payment',
            amount: plan.amount * subscription.quantity,
            currency: 'USD',
            status: 'failed',
            metadata: { error: errorMessage }
          }
        });
        await this.webhookService.emitEvent('invoice.payment_failed', { 
          invoice,
          payment: {
            id: 'failed_payment',
            amount: plan.amount * subscription.quantity,
            currency: 'USD',
            status: 'failed',
            metadata: { error: errorMessage }
          }
        });

        return {
          success: false,
          error: errorMessage,
          invoiceId: invoice.id,
          nextRetryDate: this.calculateNextRetryDate(subscription.failedPaymentCount + 1)
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing subscription payment', { 
        subscriptionId: subscription.id,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // ============= HELPER METHODS =============

  private async createInvoiceForSubscription(subscription: Subscription, plan: SubscriptionPlan): Promise<Invoice> {
    const invoice: Invoice = {
      id: `inv_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      amount: plan.amount * subscription.quantity,
      currency: plan.currency,
      status: 'open',
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      dueDate: new Date(),
      attemptCount: 0,
      metadata: {
        planId: plan.id,
        planName: plan.name
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await storageService.createInvoice(invoice);
  }

  private async handleSuccessfulPayment(subscription: Subscription, invoice: Invoice, transactionId: string): Promise<void> {
    // Update invoice
    await storageService.updateInvoice(invoice.id, {
      status: 'paid',
      paidAt: new Date()
    });

    // Update subscription
    const plan = await storageService.getPlan(subscription.planId);
    if (plan) {
      const nextPeriodStart = subscription.currentPeriodEnd;
      const nextPeriodEnd = this.calculateNextBillingDate(nextPeriodStart, plan.interval, plan.intervalCount);
      const nextPaymentDate = new Date(nextPeriodEnd);

      await storageService.updateSubscription(subscription.id, {
        status: 'active',
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        nextPaymentDate,
        lastPaymentDate: new Date(),
        failedPaymentCount: 0
      });
    }

    logger.info('Successful subscription payment processed', {
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      transactionId,
      amount: invoice.amount
    });
  }

  private async handleFailedPayment(subscription: Subscription, invoice: Invoice, error: string): Promise<void> {
    const failedPaymentCount = subscription.failedPaymentCount + 1;
    const maxRetries = 3;

    // Update invoice
    await storageService.updateInvoice(invoice.id, {
      attemptCount: invoice.attemptCount + 1,
      lastPaymentError: error,
      nextPaymentAttempt: failedPaymentCount < maxRetries ? this.calculateNextRetryDate(failedPaymentCount) : undefined
    });

    // Update subscription status based on failure count
    let newStatus: SubscriptionStatus = subscription.status;
    if (failedPaymentCount >= maxRetries) {
      newStatus = 'unpaid';
    } else if (failedPaymentCount >= 1) {
      newStatus = 'past_due';
    }

    await storageService.updateSubscription(subscription.id, {
      status: newStatus,
      failedPaymentCount,
      nextPaymentDate: failedPaymentCount < maxRetries ? this.calculateNextRetryDate(failedPaymentCount) : subscription.nextPaymentDate
    });

    logger.warn('Subscription payment failed', {
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      failedPaymentCount,
      newStatus,
      error
    });
  }

  private calculateNextBillingDate(startDate: Date, interval: string, intervalCount: number): Date {
    const nextDate = new Date(startDate);
    
    switch (interval) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + intervalCount);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (intervalCount * 7));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + intervalCount);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + (intervalCount * 3));
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + intervalCount);
        break;
      default:
        throw new Error(`Unsupported billing interval: ${interval}`);
    }
    
    return nextDate;
  }

  private calculateNextRetryDate(attemptNumber: number): Date {
    // Exponential backoff: 1 day, 3 days, 7 days
    const retryDelays = [1, 3, 7]; // days
    const delayDays = retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)];
    
    const nextRetry = new Date();
    nextRetry.setDate(nextRetry.getDate() + delayDays);
    return nextRetry;
  }

  private async processSetupFee(subscription: Subscription, plan: SubscriptionPlan): Promise<void> {
    if (!plan.setupFee || plan.setupFee <= 0) return;

    // Create and process setup fee payment
    const customer = await storageService.getCustomer(subscription.customerId);
    if (!customer) return;

    const setupPaymentRequest: PaymentRequest = {
      amount: plan.setupFee,
      orderId: `setup_${subscription.id}`,
      customerInfo: {
        firstName: customer.name?.split(' ')[0] || 'Unknown',
        lastName: customer.name?.split(' ').slice(1).join(' ') || 'Customer',
        email: customer.email
      },
      paymentMethod: {
        type: 'credit_card',
        cardNumber: '4111111111111111',
        expirationDate: '1225', // MMYY format
        cvv: '123'
      },
      metadata: {
        subscriptionId: subscription.id,
        type: 'setup_fee'
      }
    };

    await this.paymentService.processPayment(setupPaymentRequest);
  }

  private async handlePlanChange(subscription: Subscription, newPlan: SubscriptionPlan): Promise<void> {
    // In a real implementation, this would handle proration
    // For now, we'll just update the next payment date based on the new plan
    const nextPaymentDate = this.calculateNextBillingDate(
      subscription.currentPeriodStart,
      newPlan.interval,
      newPlan.intervalCount
    );

    await storageService.updateSubscription(subscription.id, {
      nextPaymentDate
    });

    logger.info('Plan change processed', {
      subscriptionId: subscription.id,
      oldPlanId: subscription.planId,
      newPlanId: newPlan.id
    });
  }

  private startRecurringBillingJob(): void {
    // Process recurring payments every 5 minutes
    setInterval(async () => {
      await this.processRecurringPayments();
    }, 5 * 60 * 1000); // 5 minutes

    logger.info('Recurring billing job started');
  }
}
