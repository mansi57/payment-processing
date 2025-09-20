@echo off
echo.
echo =====================================================
echo PostgreSQL Database Setup for Payment Processing
echo =====================================================
echo.

set "PSQL_PATH=C:\Program Files\PostgreSQL\17\bin\psql.exe"
set "PG_HOST=localhost"
set "PG_USER=postgres"

echo Testing PostgreSQL connection...
echo.

echo Enter your PostgreSQL password when prompted.
echo If you don't know the password, try: postgres, admin, password, or just press Enter
echo.

"%PSQL_PATH%" -h %PG_HOST% -U %PG_USER% -c "SELECT version();"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  Connection successful! Now creating database...
    echo.
    "%PSQL_PATH%" -h %PG_HOST% -U %PG_USER% -c "CREATE DATABASE payment_processing;"
    if %ERRORLEVEL% EQU 0 (
        echo  Database 'payment_processing' created successfully!
    ) else (
        echo   Database might already exist or there was an error
    )
    echo.
    echo  Database setup complete!
    echo You can now start the Node.js application.
) else (
    echo.
    echo  Connection failed. Please check your PostgreSQL password.
    echo Update the DB_PASSWORD in your .env file with the correct password.
)

echo.
pause
