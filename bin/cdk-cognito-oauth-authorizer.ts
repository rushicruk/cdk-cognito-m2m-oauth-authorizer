#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkCognitoOauthAuthorizerStack } from "../lib/cdk-cognito-oauth-authorizer-stack";

const app = new cdk.App();
new CdkCognitoOauthAuthorizerStack(app, "CdkCognitoOauthAuthorizerStack", {
  env: { account: "438422980939", region: "eu-west-2" },
});
