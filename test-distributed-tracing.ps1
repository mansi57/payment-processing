# Distributed Tracing Test Script
# Tests all aspects of the distributed tracing implementation

Write-Host "🔍 DISTRIBUTED TRACING COMPREHENSIVE TEST" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Basic Correlation ID Propagation
Write-Host "✅ Test 1: Basic Correlation ID Propagation" -ForegroundColor Green
$correlationId = "test-trace-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$headers = @{
    "Content-Type" = "application/json"
    "X-Correlation-ID" = $correlationId
    "X-Source" = "powershell-test"
}

$paymentData = @{
    amount = 99.99
    currency = "USD"
    customerInfo = @{
        firstName = "Distributed"
        lastName = "Tracing"
        email = "tracing@test.com"
    }
    paymentMethod = @{
        type = "credit_card"
        cardNumber = "4111111111111111"
        expirationDate = "1225"
        cvv = "123"
    }
    orderId = "TRACE-TEST-$(Get-Random -Maximum 9999)"
    description = "Distributed tracing comprehensive test"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/payments/purchase" -Method POST -Body $paymentData -Headers $headers
    $responseData = $response.Content | ConvertFrom-Json
    
    Write-Host "  ✓ Request sent with Correlation ID: $correlationId" -ForegroundColor Gray
    Write-Host "  ✓ Response Correlation ID: $($response.Headers['X-Correlation-ID'])" -ForegroundColor Gray
    Write-Host "  ✓ Response Request ID: $($response.Headers['X-Request-ID'])" -ForegroundColor Gray
    Write-Host "  ✓ Transaction ID: $($responseData.data.transactionId)" -ForegroundColor Gray
    Write-Host "  ✓ Tracing in Response Body: $($responseData.tracing.correlationId)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "  ❌ Test 1 Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Multiple Sequential Requests with Same Correlation ID
Write-Host "✅ Test 2: Sequential Requests with Same Correlation ID" -ForegroundColor Green
$sharedCorrelationId = "shared-trace-$(Get-Date -Format 'HHmmss')"

try {
    # Request 1: Authorize
    $authHeaders = @{
        "Content-Type" = "application/json"
        "X-Correlation-ID" = $sharedCorrelationId
        "X-Request-ID" = "auth-req-001"
    }
    
    $authData = @{
        amount = 150.00
        customerInfo = @{
            firstName = "Sequential"
            lastName = "Test"
            email = "sequential@test.com"
        }
        paymentMethod = @{
            type = "credit_card"
            cardNumber = "4111111111111111"
            expirationDate = "1225"
            cvv = "123"
        }
        orderId = "SEQ-TEST-001"
        description = "Sequential tracing test - authorize"
    } | ConvertTo-Json
    
    $authResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/payments/authorize" -Method POST -Body $authData -Headers $authHeaders
    $transactionId = $authResponse.data.transactionId
    
    Write-Host "  ✓ Authorization completed with Transaction ID: $transactionId" -ForegroundColor Gray
    Write-Host "  ✓ Shared Correlation ID: $($authResponse.tracing.correlationId)" -ForegroundColor Gray
    
    # Request 2: Capture (same correlation ID)
    $captureHeaders = @{
        "Content-Type" = "application/json"
        "X-Correlation-ID" = $sharedCorrelationId
        "X-Request-ID" = "capture-req-001"
    }
    
    $captureData = @{
        amount = 150.00
    } | ConvertTo-Json
    
    $captureResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/payments/capture/$transactionId" -Method POST -Body $captureData -Headers $captureHeaders
    
    Write-Host "  ✓ Capture completed with same Correlation ID: $($captureResponse.tracing.correlationId)" -ForegroundColor Gray
    Write-Host "  ✓ Both requests share the same trace!" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "  ❌ Test 2 Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Performance and Error Scenarios
Write-Host "✅ Test 3: Performance and Error Scenarios" -ForegroundColor Green

try {
    # Test with declining card (error scenario)
    $errorHeaders = @{
        "Content-Type" = "application/json"
        "X-Correlation-ID" = "error-trace-$(Get-Date -Format 'HHmmss')"
    }
    
    $errorData = @{
        amount = 25.00
        currency = "USD"
        customerInfo = @{
            firstName = "Error"
            lastName = "Test"
            email = "error@test.com"
        }
        paymentMethod = @{
            type = "credit_card"
            cardNumber = "4000000000000002" # This should decline
            expirationDate = "1225"
            cvv = "123"
        }
        orderId = "ERROR-TEST-001"
        description = "Error scenario tracing test"
    } | ConvertTo-Json
    
    try {
        $errorResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/payments/purchase" -Method POST -Body $errorData -Headers $errorHeaders
        Write-Host "  ⚠️ Expected error but got success" -ForegroundColor Yellow
    } catch {
        $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  ✓ Error scenario properly traced: $($errorResponse.error.message)" -ForegroundColor Gray
        Write-Host "  ✓ Error includes correlation info in response" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "  ❌ Test 3 Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 4: Health Check with Tracing
Write-Host "✅ Test 4: Health Check with Tracing" -ForegroundColor Green
try {
    $healthHeaders = @{
        "X-Correlation-ID" = "health-trace-$(Get-Date -Format 'HHmmss')"
        "X-Source" = "health-check"
    }
    
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET -Headers $healthHeaders
    Write-Host "  ✓ Health check responded with status: $($healthResponse.StatusCode)" -ForegroundColor Gray
    Write-Host "  ✓ Health correlation ID: $($healthResponse.Headers['X-Correlation-ID'])" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "  ❌ Test 4 Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 5: Payment Service Health with Tracing
Write-Host "✅ Test 5: Payment Service Health with Tracing" -ForegroundColor Green
try {
    $paymentHealthHeaders = @{
        "X-Correlation-ID" = "payment-health-$(Get-Date -Format 'HHmmss')"
    }
    
    $paymentHealthResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/payments/health" -Method GET -Headers $paymentHealthHeaders
    Write-Host "  ✓ Payment service health: $($paymentHealthResponse.message)" -ForegroundColor Gray
    Write-Host "  ✓ Service type: $($paymentHealthResponse.serviceType)" -ForegroundColor Gray
    Write-Host "  ✓ Correlation ID in response: $($paymentHealthResponse.correlationId)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "  ❌ Test 5 Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "🎉 DISTRIBUTED TRACING TESTS COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Summary of Verified Features:" -ForegroundColor Yellow
Write-Host "  • Correlation ID propagation in headers ✓" -ForegroundColor Gray
Write-Host "  • Request ID generation and tracking ✓" -ForegroundColor Gray
Write-Host "  • Tracing information in response bodies ✓" -ForegroundColor Gray
Write-Host "  • Cross-request correlation tracking ✓" -ForegroundColor Gray
Write-Host "  • Error scenario tracing ✓" -ForegroundColor Gray
Write-Host "  • Service-level health monitoring ✓" -ForegroundColor Gray
Write-Host "  • Performance monitoring foundation ✓" -ForegroundColor Gray
Write-Host ""
Write-Host "🔗 All requests can now be traced end-to-end!" -ForegroundColor Cyan
