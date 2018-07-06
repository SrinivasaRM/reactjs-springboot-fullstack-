/*
 * Copyright 2015 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.mastercard.shcomp.customer.tracker;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * @author Srinivasa Munnangi
 */
// tag::code[]
@Component
public class DatabaseLoader implements CommandLineRunner {

	private final TrackerRepository trackers;
	private final ManagerRepository managers;

	@Autowired
	public DatabaseLoader(TrackerRepository employeeRepository,
						  ManagerRepository managerRepository) {

		this.trackers = employeeRepository;
		this.managers = managerRepository;
	}

	@Override
	public void run(String... strings) throws Exception {

		Manager mcuser = this.managers.save(new Manager("test", "test",
							"ROLE_MANAGER"));
		Manager baig = this.managers.save(new Manager("baig", "baig",
							"ROLE_MANAGER"));

        Manager bharat = this.managers.save(new Manager("bharat", "bharat",
                "ROLE_MANAGER"));

		SecurityContextHolder.getContext().setAuthentication(
			new UsernamePasswordAuthenticationToken("test", "doesn't matter",
				AuthorityUtils.createAuthorityList("ROLE_MANAGER")));

		this.trackers.save(new Tracker("Bank Of America", "CreditCard", "Pre Sales", mcuser));
		this.trackers.save(new Tracker("WellsFargo", "Loyalty Program", "Under Contract", mcuser));
		this.trackers.save(new Tracker("Capital One", "3D Secure", "On Boarding", mcuser));

		SecurityContextHolder.getContext().setAuthentication(
			new UsernamePasswordAuthenticationToken("baig", "doesn't matter",
				AuthorityUtils.createAuthorityList("ROLE_MANAGER")));



		this.trackers.save(new Tracker("JP Morgan", "DebitCard", "RFP", baig));
		this.trackers.save(new Tracker("USAA", "Switch", "Implementaion", baig));
		this.trackers.save(new Tracker("SSFCU", "Processing", "Renewal", baig));


        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("bharat", "doesn't matter",
                        AuthorityUtils.createAuthorityList("ROLE_MANAGER")));



        this.trackers.save(new Tracker("Caixa", "MDES", "RFP", bharat));
        this.trackers.save(new Tracker("Key Bank", "MasterPass", "Implementaion", bharat));
        this.trackers.save(new Tracker("FCBI", "Clearing", "started", bharat));


		SecurityContextHolder.clearContext();
	}
}
// end::code[]