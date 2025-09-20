declare module 'authorizenet' {
  export namespace APIContracts {
    export class MerchantAuthenticationType {
      setName(name: string): void;
      setTransactionKey(key: string): void;
    }

    export class CreateTransactionRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setTransactionRequest(request: TransactionRequestType): void;
    }

    export class TransactionRequestType {
      setTransactionType(type: string): void;
      setAmount(amount: number): void;
      setMerchantDescriptor(descriptor: string): void;
      setPayment(payment: PaymentType): void;
      setCustomer(customer: CustomerDataType): void;
      setBillTo(billTo: CustomerAddressType): void;
      setOrder(order: OrderType): void;
      setRefTransId(id: string): void;
    }

    export class PaymentType {
      setCreditCard(card: CreditCardType): void;
      setBankAccount(account: BankAccountType): void;
    }

    export class CreditCardType {
      setCardNumber(number: string): void;
      setExpirationDate(date: string): void;
      setCardCode(code: string): void;
    }

    export class BankAccountType {
      setAccountNumber(number: string): void;
      setRoutingNumber(number: string): void;
      setAccountType(type: string): void;
    }

    export class CustomerDataType {
      setId(id: string): void;
      setEmail(email: string): void;
    }

    export class CustomerAddressType {
      setFirstName(name: string): void;
      setLastName(name: string): void;
      setAddress(address: string): void;
      setCity(city: string): void;
      setState(state: string): void;
      setZip(zip: string): void;
      setCountry(country: string): void;
      setPhoneNumber(phone: string): void;
    }

    export class OrderType {
      setInvoiceNumber(number: string): void;
      setDescription(description: string): void;
    }

    export class CreateTransactionResponse {
      constructor(response: any);
      getMessages(): Messages;
      getTransactionResponse(): TransactionResponse;
    }

    export class Messages {
      getResultCode(): string;
      getMessage(): Message[];
    }

    export class Message {
      getText(): string;
      getDescription(): string;
    }

    export class TransactionResponse {
      getTransId(): string;
      getAuthCode(): string;
      getResponseCode(): string;
      getMessages(): Messages | null;
      getErrors(): Errors | null;
    }

    export class Errors {
      getError(): Error[];
    }

    export class Error {
      getErrorText(): string;
    }
  }

  export namespace APIControllers {
    export class CreateTransactionController {
      constructor(request: any);
      setEnvironment(env: string): void;
      execute(callback: () => void): void;
      getResponse(): any;
    }
  }

  export namespace Constants {
    export const endpoint: {
      sandbox: string;
      production: string;
    };

    export const messageTypes: {
      ok: string;
    };

    export const transactionTypes: {
      authCaptureTransaction: string;
      authOnlyTransaction: string;
      priorAuthCaptureTransaction: string;
      refundTransaction: string;
      voidTransaction: string;
    };

    export const bankAccountType: {
      checking: string;
      savings: string;
    };
  }
}








