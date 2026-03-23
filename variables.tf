# ---------------------------------------------------------------------
#       MODULO LANDING ZONE
# ---------------------------------------------------------------------
variable "vpc_name" {
  type        = string
  description = "VPC Name"
}

variable "project_name" {
  type        = string
  description = "Project Name"
}

variable "area" {
  type        = string
  description = "Area of business unit"
}

variable "ecosistema" {
  type        = string
  description = "Id ecosistema IEECO"
}

variable "environment" {
  type        = string
  description = "Environment for these project"
}

variable "region" {
  type        = string
  description = "region"

}
variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR"
}

variable "non_route_cidr" {
  description = "PRIVATE CIDR FOR NON ROUTE COMPONENTS"
  type        = string
  default     = ""
}

variable "has_internet" {
  type        = bool
  description = "Optional Variable to put an internet gtw"
}

variable "subnets" {
  description = "Subnets for VPC"
  type = map(object({
    cidr = string
    az   = string
  }))
}

variable "route_tables" {
  description = "Route tables"
  type = map(object({
    subnets = list(string)
  }))
}

variable "main_rt" {
  type = string
}

variable "routes" {
  description = "Routes for route tables"
  default     = null
  type = list(object(
    {
      route_table_name       = string
      target_type            = string
      target_id              = string
      destination_cidr_block = string
    }
  ))
}

variable "s3_logging" {
  type = object({
    object_lock_mode            = string
    object_lock_retention_days  = optional(number)
    object_lock_retention_years = optional(number)
  })
}

variable "object_lock_configuration" {
  type = object({
    mode  = string # Valid values are GOVERNANCE and COMPLIANCE.
    days  = optional(number)
    years = optional(number)
  })
  default     = null
  description = "A configuration for S3 object locking. With S3 Object Lock, you can store objects using a `write once, read many` (WORM) model. Object Lock can help prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely."
}

variable "existing_vpc" {
  description = "Use an existing VPC"
  default     = null
  type = object({
    name       = string
    cidr_block = string
  })
}

variable "vpc_cidr-2" {
  description = "PRIVATE CIDR FOR ROUTE COMPONENTS"
  type        = string
  default     = null
}

variable "vpc_nrt_cidr" {
  description = "PRIVATE CIDR FOR NON ROUTE COMPONENTS"
  type        = string
  default     = null
}

# ---------------------------------------------------------------------
#     S3 LOGGING
variable "s3_enable_versioning" {
  type        = string
  description = "(Required) Versioning state of the bucket. Valid values: Enabled, Suspended, or Disabled. Disabled should only be used when creating or importing resources that correspond to unversioned S3 buckets."
  default     = "Disabled"
}



# ---------------------------------------------------------------------
#      MODULO SG

variable "security_groups" {
  type = list(object({
    sg_name     = string
    description = optional(string)
    ingress = optional(map(object({
      from_port       = number
      to_port         = number
      cidr_blocks     = optional(list(string))
      description     = string
      protocol        = string
      security_groups = optional(list(string))
    })))
    egress = optional(map(object({
      from_port       = number
      to_port         = number
      cidr_blocks     = optional(list(string))
      description     = string
      protocol        = string
      security_groups = optional(list(string))
    })))
  }))
}

# ---------------------------------------------------------------------
#         MODULO NAT GATEWAY
variable "is_internal" {
  type        = bool
  description = "Mark the Nat Gateway as private or Internet-enabled. Caution: Changing the schema will cause the resource to be rebuilt!"
  default     = true
}

variable "subnet_name" {
  type        = string
  description = "Subnet ID to allocate the NAT Gateway"

  validation {
    condition     = var.subnet_name != ""
    error_message = "This value is totally mandatory. Provide the subnet id"
  }
}

# ---------------------------------------------------------------------
#      MOD LOAD BALANCER
# ---------------------------------------------------------------------
variable "lb" {
  description = "Load balancer object"
  type = object({
    name                         = string
    is_internal                  = bool
    type                         = string
    vpc_security_groups_tag_name = list(string)
    subnets                      = list(string)
    enable_deletion_protection   = bool
    enable_access_logs           = bool
    bucket_access_logs           = optional(string)
    prefix_access_logs           = optional(string)
    enable_connection_logs       = bool
    bucket_connection_logs       = string
    prefix_connection_logs       = string
    tags                         = optional(map(string))
    nlb_subnet_mapping = optional(map(object({
      subnet_id            = string,
      private_ipv4_address = string
    })))
  })
}

variable "listeners" {
  description = "List of listeners for Load Balancer"
  type = map(object({
    listener_port          = number
    listener_protocol      = string
    listener_ssl_policy    = optional(string)
    acm_certificate_domain = optional(string)
    additional_certs       = optional(list(string))
    default_action_type    = optional(string)
    fixed_response = optional(object({
      content_type = string,
      message_body = string,
      status_code  = string
    }))
    default_target_group_name = optional(string)
    redirect = optional(object({
      port        = string
      protocol    = string
      status_code = string
    }))
  }))
}

variable "target_groups" {
  type = map(object({
    name        = optional(string)
    port        = optional(number)
    protocol    = optional(string)
    vpc_name    = optional(string)
    target_type = optional(string)
    target_health_state = optional(object({
      enable_unhealthy_connection_termination = bool
    }))
    health_check_enabled       = optional(bool)
    healthy_threshold          = optional(number)
    health_check_interval      = optional(number)
    health_check_matcher       = optional(string)
    health_check_path          = optional(string)
    health_check_port          = optional(string)
    health_check_protocol      = optional(string)
    health_check_timeout       = optional(number)
    unhealthy_threshold        = optional(number)
    stickiness_cookie_duration = optional(number)
    stickiness_cookie_name     = optional(string)
    deregistration_delay       = optional(string)
  }))
}

variable "listener_rules" {
  type = map(object({
    lb_name           = string
    listener_port     = string
    priority          = number
    action_type       = string
    target_group_name = optional(string)
    forward = optional(list(object({
      target_group = list(object({
        name   = string
        weight = number
      }))
      stickiness = optional(object({
        enabled  = bool
        duration = number
      }))
    })))
    condition_values = object({
      host_header         = optional(list(string))
      http_header         = optional(map(string))
      http_request_method = optional(list(string))
      path_pattern        = optional(list(string))
      query_string        = optional(map(string))
      source_ip           = optional(list(string))
    })
    fixed_response = optional(object({
      content_type = string
      message_body = string
      status_code  = string
    }))
  }))
}

variable "target_group_attachments" {
  type = map(object({
    target_group_name    = string
    target_id            = string
    port                 = optional(string)
    lambda_function_name = optional(string)
  }))
}