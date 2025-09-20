# Payment API Testing Script
Write-Host "=== Payment Processing API Tests ===" -ForegroundColor Green

$baseUrl = "http://localhost:3000/api/payments"
$headers = @{'Content-Type' = 'application/json'}

# Test 1: Health Check
Write-Host "`n1. Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "✅ Health Check: SUCCESS" -ForegroundColor Green
    Write-Host "   Status: $($health.success), Environment: $($health.environment)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health Check: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Purchase Payment
Write-Host "`n2. Testing Purchase Payment..." -ForegroundColor Yellow
$purchaseData = @{
    amount = 25.99
    customerInfo = @{
        firstName = "John"
        lastName = "Doe"
        email = "john.doe@example.com"
    }
    paymentMethod = @{
        type = "credit_card"
        cardNumber = "4111111111111111"
        expirationDate = "1225"
        cvv = "123"
    }
    description = "Test purchase"
    orderId = "TEST-" + (Get-Date -Format "yyyyMMddHHmmss")
} | ConvertTo-Json

try {
    $purchase = Invoke-RestMethod -Uri "$baseUrl/purchase" -Method POST -Body $purchaseData -Headers $headers
    Write-Host "✅ Purchase Payment: SUCCESS" -ForegroundColor Green
    Write-Host "   Transaction ID: $($purchase.data.transactionId)" -ForegroundColor Gray
    Write-Host "   Amount: $($purchase.data.amount)" -ForegroundColor Gray
    $global:purchaseTransactionId = $purchase.data.transactionId
} catch {
    Write-Host "❌ Purchase Payment: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "   Error Details: $errorBody" -ForegroundColor Red
    }
}

# Test 3: Authorization Only
Write-Host "`n3. Testing Authorization Only..." -ForegroundColor Yellow
$authData = @{
    amount = 15.50
    customerInfo = @{
        firstName = "Jane"
        lastName = "Smith"
        email = "jane.smith@example.com"
    }
    paymentMethod = @{
        type = "credit_card"
        cardNumber = "5555555555554444"
        expirationDate = "0626"
        cvv = "456"
    }
    description = "Test authorization"
    orderId = "AUTH-" + (Get-Date -Format "yyyyMMddHHmmss")
} | ConvertTo-Json

try {
    $auth = Invoke-RestMethod -Uri "$baseUrl/authorize" -Method POST -Body $authData -Headers $headers
    Write-Host "✅ Authorization: SUCCESS" -ForegroundColor Green
    Write-Host "   Auth Transaction ID: $($auth.data.transactionId)" -ForegroundColor Gray
    Write-Host "   Auth Code: $($auth.data.authCode)" -ForegroundColor Gray
    $global:authTransactionId = $auth.data.transactionId
} catch {
    Write-Host "❌ Authorization: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "   Error Details: $errorBody" -ForegroundColor Red
    }
}

# Test 4: Capture (if authorization was successful)
if ($global:authTransactionId) {
    Write-Host "`n4. Testing Capture Payment..." -ForegroundColor Yellow
    $captureData = @{
        amount = 15.50
    } | ConvertTo-Json

    try {
        $capture = Invoke-RestMethod -Uri "$baseUrl/capture/$($global:authTransactionId)" -Method POST -Body $captureData -Headers $headers
        Write-Host "✅ Capture: SUCCESS" -ForegroundColor Green
        Write-Host "   Capture Transaction ID: $($capture.data.transactionId)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Capture: FAILED - $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
            Write-Host "   Error Details: $errorBody" -ForegroundColor Red
        }
    }
}

# Test 5: Input Validation Error
Write-Host "`n5. Testing Input Validation..." -ForegroundColor Yellow
$invalidData = @{
    amount = "invalid"
} | ConvertTo-Json

try {
    $invalid = Invoke-RestMethod -Uri "$baseUrl/purchase" -Method POST -Body $invalidData -Headers $headers
    Write-Host "❌ Validation: FAILED - Should have returned validation error" -ForegroundColor Red
} catch {
    Write-Host "✅ Validation: SUCCESS - Properly rejected invalid input" -ForegroundColor Green
    Write-Host "   Error Message: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host "`n=== Testing Complete ===" -ForegroundColor Green



