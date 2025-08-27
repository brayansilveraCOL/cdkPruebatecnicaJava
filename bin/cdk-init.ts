import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

new EcsStack(app, 'EcsFargateSpringStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },

    repoName: 'backend/java',
    imageTag: 'develop',
    containerPort: 8080,
    tableName: 'fondo-btg-pactual-develop',
    springProfile: 'prod'
});
