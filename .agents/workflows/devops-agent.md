---
description: How to set up cloud infrastructure and CI/CD for Mapai
---

# DevOps / Infrastructure Agent Workflow

This agent provisions cloud infrastructure and CI/CD pipelines. Run immediately in Sprint 0.

## Context

- **Cloud provider**: AWS (recommended in PRD §14.2)
- **Environments**: dev / staging / prod
- **Auth**: Supabase (managed)
- **Database**: PostgreSQL via Supabase
- **Deployment**: ECS or Lambda for API services

## Sprint 0 Tasks

1. **AWS account setup**
   - Create AWS account or configure existing one
   - Set up IAM roles for CI/CD and application services
   - Enable AWS CloudWatch for logging and monitoring

2. **Environment provisioning**
   - Create 3 environments: dev, staging, prod
   - Set up environment-specific `.env` files and secret management (AWS Secrets Manager)
   - Configure networking (VPC, subnets, security groups)

3. **CI/CD Pipeline (GitHub Actions)**
   - On PR: lint, type-check, unit tests
   - On merge to `main`: auto-deploy to staging
   - On release tag: deploy to prod with manual approval gate
   - Mobile: configure EAS Build for iOS + Android

   ```yaml
   # .github/workflows/mobile-ci.yml
   name: Mobile CI
   on: [pull_request]
   jobs:
     typecheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm ci
           working-directory: mobile-app
         - run: npx tsc --noEmit
           working-directory: mobile-app
   ```

4. **Supabase project setup**
   - Create Supabase project for each environment
   - Configure Auth providers (Apple, Google)
   - Set up database migrations workflow
   - Enable Row Level Security (RLS) policies

5. **Expo Application Services (EAS)**
   // turbo
   - Run: `npx -y eas-cli build:configure` in mobile-app directory
   - Configure build profiles for development, preview, and production
   - Set up OTA update channels

## Monitoring & Alerting

- CloudWatch dashboards for API latency, error rates, LLM call costs
- Supabase dashboard for auth metrics and database performance
- Expo crash reporting integration
- Budget alerts at $50, $100, $200/month for AWS + API costs
