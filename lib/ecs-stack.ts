import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface EcsStackProps extends cdk.StackProps {
    repoName: string;
    imageTag: string;
    containerPort: number;
    tableName: string;
    springProfile?: string;
}

export class EcsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EcsStackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
        });

        const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

        const repo = ecr.Repository.fromRepositoryName(this, 'Repo', props.repoName);
        const image = ecs.ContainerImage.fromEcrRepository(repo, props.imageTag);

        const logGroup = new logs.LogGroup(this, 'AppLogs', {
            retention: logs.RetentionDays.ONE_WEEK,
        });

        const executionRole = new iam.Role(this, 'ExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'Execution role for ECS tasks (ECR pull, logs, + DynamoDB FullAccess as requested)',
        });
        executionRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        );
        executionRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        );

        const taskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'Application task role (DynamoDB FullAccess as requested)',
        });
        taskRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        );

        const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            cpu: 512,
            memoryLimitMiB: 1024,
            executionRole,
            taskRole,
        });

        const container = taskDef.addContainer('AppContainer', {
            image,
            logging: ecs.LogDriver.awsLogs({ logGroup, streamPrefix: 'app' }),
            environment: {
                TABLE_DYNAMODB: props.tableName,
                SPRING_PROFILES_ACTIVE: props.springProfile ?? 'prod',
                AWS_REGION: this.region,
            },
        });
        container.addPortMappings({ containerPort: props.containerPort });

        const albService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
            cluster,
            taskDefinition: taskDef,
            desiredCount: 1,
            publicLoadBalancer: true,
            assignPublicIp: true,
        });

        albService.targetGroup.configureHealthCheck({
            path: '/actuator/health',
            healthyHttpCodes: '200-399',
            interval: cdk.Duration.seconds(30),
        });

        new cdk.CfnOutput(this, 'LoadBalancerDNS', {
            value: albService.loadBalancer.loadBalancerDnsName,
        });
    }
}
