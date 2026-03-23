vpc_name = "vpc-paperless-dev"
project_name = "paperless"
area = "concesionarios"
ecosistema = "ektmotos"
environment = "dev"
region = "us-east-1"
vpc_cidr = "10.102.67.0/24"
non_route_cidr = "100.64.0.0/16"
has_internet = true
subnets = {
  SUBNET-PRIVADA-RT1-DEV = {
    cidr = "10.102.67.64/27"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PRIVADA-RT1-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-RT2-DEV = {
    cidr = "10.102.67.128/28"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PRIVADA-RT2-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-RT3-DEV = {
    cidr = "10.102.67.144/28"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PRIVADA-RT3-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-RT4-DEV = {
    cidr = "10.102.67.112/28"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PRIVADA-RT4-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-RT5-DEV = {
    cidr = "10.102.67.96/28"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PRIVADA-RT5-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-RT6-DEV = {
    cidr = "10.102.67.32/27"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PRIVADA-RT6-DEV"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-NRT7-DEV = {
    cidr = "100.64.0.0/20"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PRIVADA-NRT7-DEV"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-NRT8-DEV = {
    cidr = "100.64.16.0/20"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PRIVADA-NRT8-DEV"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-NRT9-DEV = {
    cidr = "100.64.32.0/22"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PRIVADA-NRT9-DEV"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  SUBNET-PRIVADA-NRT10-DEV = {
    cidr = "100.64.36.0/22"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PRIVADA-NRT10-DEV"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  SUBNET-PUBLICA-RT11-DEV = {
    cidr = "10.102.67.0/28"
    az = "us-east-1a"
    tags = {
      Name = "SUBNET-PUBLICA-RT11-DEV"
      Type = "public-rt"
      Environment = "dev"
    }
  }
  SUBNET-PUBLICA-RT12-DEV = {
    cidr = "10.102.67.16/28"
    az = "us-east-1b"
    tags = {
      Name = "SUBNET-PUBLICA-RT12-DEV"
      Type = "public-rt"
      Environment = "dev"
    }
  }
}
route_tables = {
  RT-PAPERLESS-ROUTABLE-PRIVATE-1 = {
    routes = []
    associated_subnets = ["SUBNET-PRIVADA-RT1-DEV", "SUBNET-PRIVADA-RT2-DEV"]
    tags = {
      Name = "RT-PAPERLESS-ROUTABLE-PRIVATE-1"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  RT-PAPERLESS-ROUTABLE-PRIVATE-2 = {
    routes = []
    associated_subnets = ["SUBNET-PRIVADA-RT3-DEV", "SUBNET-PRIVADA-RT4-DEV"]
    tags = {
      Name = "RT-PAPERLESS-ROUTABLE-PRIVATE-2"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  RT-PAPERLESS-ROUTABLE-PRIVATE-3 = {
    routes = []
    associated_subnets = ["SUBNET-PRIVADA-RT5-DEV", "SUBNET-PRIVADA-RT6-DEV"]
    tags = {
      Name = "RT-PAPERLESS-ROUTABLE-PRIVATE-3"
      Type = "private_rt"
      Environment = "dev"
    }
  }
  RT-PAPERLESS-NON-ROUTABLE-PRIVATE-1 = {
    routes = []
    associated_subnets = ["SUBNET-PRIVADA-NRT7-DEV", "SUBNET-PRIVADA-NRT8-DEV"]
    tags = {
      Name = "RT-PAPERLESS-NON-ROUTABLE-PRIVATE-1"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  RT-PAPERLESS-NON-ROUTABLE-PRIVATE-2 = {
    routes = []
    associated_subnets = ["SUBNET-PRIVADA-NRT9-DEV", "SUBNET-PRIVADA-NRT10-DEV"]
    tags = {
      Name = "RT-PAPERLESS-NON-ROUTABLE-PRIVATE-2"
      Type = "private_nrt"
      Environment = "dev"
    }
  }
  RT-PAPERLESS-ROUTABLE-PUBLIC-1 = {
    routes = []
    associated_subnets = ["SUBNET-PUBLICA-RT11-DEV", "SUBNET-PUBLICA-RT12-DEV"]
    tags = {
      Name = "RT-PAPERLESS-ROUTABLE-PUBLIC-1"
      Type = "public-rt"
      Environment = "dev"
    }
  }
}
main_rt = "RT-PAPERLESS-ROUTABLE-PRIVATE-1"
routes = null
s3_logging = null
object_lock_configuration = null
existing_vpc = null
vpc_cidr-2 = null
vpc_nrt_cidr = null
s3_enable_versioning = "Enabled"
security_groups = null
is_internal = true
subnet_name = null
lb = null
listeners = null
target_groups = null
listener_rules = null
target_group_attachments = null